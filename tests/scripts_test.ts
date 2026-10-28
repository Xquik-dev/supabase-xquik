import { assertEquals } from "@std/assert";

const REPO = new URL("..", import.meta.url).pathname;
const EMPTY_ENUMS = '    Enums: {\n      [_ in never]: never;\n    };\n\n    | keyof DefaultSchema["Enums"]\n';

function names(dir: string): string[] {
  return Deno.readDirSync(dir).map(({ name }) => name).toArray();
}

Deno.test("importing a script runs none of its command", async () => {
  const root = await Deno.makeTempDir();
  await Deno.mkdir(`${root}/supabase/migrations`, { recursive: true });
  await Deno.copyFile(`${REPO}openapi.json`, `${root}/openapi.json`);
  await Deno.writeTextFile(`${root}/types.ts`, EMPTY_ENUMS);
  const scripts = ["generate.ts", "types.ts", "type_coverage.ts"];
  const preloads = scripts.flatMap((name) => ["--preload", `${REPO}scripts/${name}`]);
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--config", `${REPO}deno.json`, "--allow-all", ...preloads, `${REPO}scripts/sql.ts`, "types.ts"],
    cwd: root,
  }).output();
  assertEquals({
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    migrations: names(`${root}/supabase/migrations`),
    types: await Deno.readTextFile(`${root}/types.ts`),
  }, { code: 0, stdout: "", migrations: [], types: EMPTY_ENUMS });
  await Deno.remove(root, { recursive: true });
});
