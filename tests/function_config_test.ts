import { assertEquals } from "@std/assert";
import { z } from "zod";

const FUNCTIONS = "supabase/functions";

const denoConfig = z.object({ imports: z.record(z.string(), z.string()) });
const moduleGraph = z.object({
  modules: z.array(z.object({
    specifier: z.string(),
    dependencies: z.array(z.object({ specifier: z.string() })).default([]),
  })),
});

async function bareImports(entry: string): Promise<string[]> {
  const { success, stdout } = await new Deno.Command("node_modules/.bin/deno", { args: ["info", "--json", entry] })
    .output();
  if (!success) throw new Error(`deno info ${entry} failed`);
  const graph = moduleGraph.parse(JSON.parse(new TextDecoder().decode(stdout)));
  const specifiers = graph.modules
    .filter((module) => module.specifier.startsWith("file:"))
    .flatMap((module) => module.dependencies.map((dependency) => dependency.specifier))
    .filter((specifier) => !specifier.startsWith("."));
  return [...new Set(specifiers)].toSorted();
}

const root = denoConfig.parse(JSON.parse(Deno.readTextFileSync("deno.json")));
const functions = [...Deno.readDirSync(FUNCTIONS)]
  .filter((entry) => entry.isDirectory && !entry.name.startsWith("_"))
  .map((entry) => entry.name);

for (const name of functions) {
  Deno.test(`${name} has its own deno.json with the root specifier of each package it imports`, async () => {
    const own = denoConfig.parse(JSON.parse(await Deno.readTextFile(`${FUNCTIONS}/${name}/deno.json`)));
    const used = await bareImports(`./${FUNCTIONS}/${name}/index.ts`);
    assertEquals(own.imports, Object.fromEntries(used.map((specifier) => [specifier, root.imports[specifier]])));
  });
}
