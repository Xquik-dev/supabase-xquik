import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { summary, typeCoverage } from "../scripts/type_coverage.ts";

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SCRIPT = `${REPO}/scripts/type_coverage.ts`;

const ANY_FROM_LIBRARIES = `export function first(value: unknown): unknown {
  if (Array.isArray(value)) return value[0];
  return value;
}
export const parsed = Promise.resolve(JSON.parse("1"));
export const maybe: string | Promise<unknown> = parsed;
`;

async function project(files: Record<string, string>, compilerOptions: object = { strict: true }): Promise<string> {
  const root = await Deno.makeTempDir();
  await Deno.writeTextFile(`${root}/deno.json`, JSON.stringify({ compilerOptions }));
  for (const [name, text] of Object.entries(files)) await Deno.writeTextFile(`${root}/${name}`, text);
  return root;
}

Deno.test("reports each value whose type holds any, in a union member or a type argument", async () => {
  const root = await project({ "first.ts": ANY_FROM_LIBRARIES });
  const report = await typeCoverage(root, ["first.ts"]);
  assertEquals(report.uncovered.map(({ file, line, column, text }) => `${file}:${line}:${column} ${text}`), [
    "first.ts:2:36 value[0]",
    "first.ts:2:36 value",
    "first.ts:5:14 parsed",
    `first.ts:5:23 Promise.resolve(JSON.parse("1"))`,
    `first.ts:5:39 JSON.parse("1")`,
    "first.ts:6:49 parsed",
  ]);
  assertEquals(
    summary(report).split("\n").at(-1),
    "Type coverage is 71.43%. 6 of 21 values have a type that contains any.",
  );
});

Deno.test("resolves local, jsr and npm imports the way deno check does", async () => {
  const report = await typeCoverage(REPO, ["tests/webhook_test.ts"]);
  assertEquals(report.uncovered, []);
  assertEquals(
    summary({ checked: 0, uncovered: [] }),
    "Type coverage is 100.00%. 0 of 0 values have a type that contains any.",
  );
});

Deno.test("fails when the program has a type error or a bad compiler option", async () => {
  const typeError = await project({ "wrong.ts": `export const count: number = "one";\n` });
  await assertRejects(
    () => typeCoverage(typeError, ["wrong.ts"]),
    Error,
    `wrong.ts:1:14 Type 'string' is not assignable to type 'number'.`,
  );
  const badOption = await project({ "fine.ts": "export const count = 1;\n" }, { strict: "yes" });
  await assertRejects(() => typeCoverage(badOption, ["fine.ts"]), Error, "Compiler option 'strict' requires");
  await assertRejects(() => typeCoverage(badOption, ["missing.ts"]), Error, "deno info failed");
});

Deno.test("the command exits 1 and lists the sites only when a value has any", async () => {
  const root = await project({ "first.ts": ANY_FROM_LIBRARIES, "fine.ts": "export const count = 1;\n" });
  const run = async (file: string): Promise<{ code: number; lines: string[] }> => {
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--config", `${REPO}/deno.json`, "--allow-read", "--allow-run", "--allow-env", SCRIPT, file],
      cwd: root,
    }).output();
    return { code: output.code, lines: new TextDecoder().decode(output.stdout).trim().split("\n") };
  };
  const dirty = await run("first.ts");
  assertEquals([dirty.code, dirty.lines.length, dirty.lines[0]], [1, 7, "first.ts:2:36 value[0]"]);
  const clean = await run("fine.ts");
  assertEquals(clean, { code: 0, lines: ["Type coverage is 100.00%. 0 of 1 values have a type that contains any."] });
  assertStringIncludes(dirty.lines.join("\n"), "6 of 21 values");
});
