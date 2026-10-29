import { assertEquals } from "@std/assert";
import parseJson from "@shared/json.ts";
import { z } from "zod";

const FUNCTIONS = "supabase/functions";

const denoConfig = z.object({ imports: z.record(z.string(), z.string()) });
const graphDependency = z.object({ specifier: z.string() });
const graphModule = z.object({
  dependencies: z.array(graphDependency).default([]),
  specifier: z.string(),
});
const moduleGraph = z.object({ modules: z.array(graphModule) });

async function bareImports(entry: string): Promise<string[]> {
  const { success, stdout } = await new Deno.Command("node_modules/.bin/deno", { args: ["info", "--json", entry] })
    .output();
  if (!success) {
    throw new Error(`deno info ${entry} failed`);
  }
  const graph = moduleGraph.parse(parseJson(new TextDecoder().decode(stdout)));
  const specifiers = graph.modules
    .filter((module) => module.specifier.startsWith("file:"))
    .flatMap((module) => module.dependencies.map((dependency) => dependency.specifier))
    .filter((specifier) => !specifier.startsWith("."));
  return [...new Set(specifiers)].toSorted();
}

const root = denoConfig.parse(parseJson(Deno.readTextFileSync("deno.json")));
const functions = [...Deno.readDirSync(FUNCTIONS)]
  .filter((entry) => entry.isDirectory && !entry.name.startsWith("_"))
  .map((entry) => entry.name);

function isLocal([, target]: readonly [string, string]): boolean {
  return target.startsWith(".");
}

function directory(target: string | undefined, base: string): string {
  return new URL(target ?? "", `file://${Deno.cwd()}/${base}`).href;
}

for (const name of functions) {
  Deno.test(`${name} has its own deno.json with the root specifier of each package it imports`, async () => {
    const own = denoConfig.parse(parseJson(await Deno.readTextFile(`${FUNCTIONS}/${name}/deno.json`)));
    const entries = Object.entries(own.imports);
    const aliases = entries.filter((entry) => isLocal(entry)).map(([alias]) => alias);
    const packages = Object.fromEntries(entries.filter((entry) => !isLocal(entry)));
    const imported = await bareImports(`./${FUNCTIONS}/${name}/index.ts`);
    const used = imported.filter((specifier) => !aliases.some((alias) => specifier.startsWith(alias)));
    assertEquals(packages, Object.fromEntries(used.map((specifier) => [specifier, root.imports[specifier]])));
    assertEquals(
      aliases.map((alias) => directory(own.imports[alias], `${FUNCTIONS}/${name}/`)),
      aliases.map((alias) => directory(root.imports[alias], "")),
    );
  });
}
