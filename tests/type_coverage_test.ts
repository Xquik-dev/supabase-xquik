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

const PROMISES = `export async function settle(maybe?: Promise<number>, pair?: [Promise<1>, 2]): Promise<number> {
  Promise.resolve(1);
  await Promise.resolve(2);
  void Promise.resolve(3);
  maybe;
  Promise.resolve(4).then(() => 5);
  ({ then: 7 });
  ({ then: (): number => 8 });
  [1, 2].map(async (n) => n);
  [1, 2].map((n) => n);
  pair;
  return 9;
}
`;

async function project(
  files: Record<string, string>,
  config: object = { compilerOptions: { strict: true } },
): Promise<string> {
  const root = await Deno.makeTempDir();
  await Deno.writeTextFile(`${root}/deno.json`, JSON.stringify(config));
  for (const [name, text] of Object.entries(files)) await Deno.writeTextFile(`${root}/${name}`, text);
  return root;
}

Deno.test("reports each value whose type holds any, in a union member or a type argument", async () => {
  const root = await project({ "first.ts": ANY_FROM_LIBRARIES });
  const report = await typeCoverage(root, ["first.ts"]);
  assertEquals(
    report.uncovered.map(({ file, line, column, text }) => `${file}:${String(line)}:${String(column)} ${text}`),
    [
      "first.ts:2:36 value[0]",
      "first.ts:2:36 value",
      "first.ts:5:14 parsed",
      `first.ts:5:23 Promise.resolve(JSON.parse("1"))`,
      `first.ts:5:39 JSON.parse("1")`,
      "first.ts:6:49 parsed",
    ],
  );
  assertEquals(summary(report).split("\n").slice(-2), [
    "Type coverage is 71.43%. 6 of 21 values have a type that contains any.",
    "0 of 0 expression statements leave a promise that no code awaits.",
  ]);
});

Deno.test("reports each statement that leaves a thenable, a voided thenable or an array of them unawaited", async () => {
  const root = await project({ "promises.ts": PROMISES });
  const report = await typeCoverage(root, ["promises.ts"]);
  assertEquals(
    report.floating.map(({ file, line, column, text }) => `${file}:${String(line)}:${String(column)} ${text}`),
    [
      "promises.ts:2:3 Promise.resolve(1)",
      "promises.ts:4:3 void Promise.resolve(3)",
      "promises.ts:5:3 maybe",
      "promises.ts:6:3 Promise.resolve(4).then(() => 5)",
      "promises.ts:8:3 ({ then: (): number => 8 })",
      "promises.ts:9:3 [1, 2].map(async (n) => n)",
      "promises.ts:11:3 pair",
    ],
  );
  assertEquals(
    summary(report).split("\n").at(-1),
    "7 of 10 expression statements leave a promise that no code awaits.",
  );
});

Deno.test("resolves local, jsr and npm imports the way deno check does", async () => {
  const report = await typeCoverage(REPO, ["tests/webhook_test.ts"]);
  assertEquals([report.uncovered, report.floating], [[], []]);
  assertEquals(summary({ checked: 0, uncovered: [], statements: 0, floating: [] }).split("\n"), [
    "Type coverage is 100.00%. 0 of 0 values have a type that contains any.",
    "0 of 0 expression statements leave a promise that no code awaits.",
  ]);
});

Deno.test("fails when the program has a type error, a bad compiler option or a config deno rejects", async () => {
  const typeError = await project({ "wrong.ts": `export const count: number = "one";\n` });
  await assertRejects(
    async () => await typeCoverage(typeError, ["wrong.ts"]),
    Error,
    `wrong.ts:1:14 Type 'string' is not assignable to type 'number'.`,
  );
  const fine = { "fine.ts": "export const count = 1;\n" };
  const badOption = await project(fine, { compilerOptions: { strict: "yes" } });
  await assertRejects(
    async () => await typeCoverage(badOption, ["fine.ts"]),
    Error,
    "Compiler option 'strict' requires",
  );
  const badLock = await project(fine, { compilerOptions: {}, lock: 5 });
  await assertRejects(
    async () => await typeCoverage(badLock, ["fine.ts"]),
    Error,
    "deno info failed with exit code 1.",
  );
});

Deno.test("the command exits 1 and lists the sites only when a value has any or a promise floats", async () => {
  const root = await project({
    "first.ts": ANY_FROM_LIBRARIES,
    "fine.ts": "export const count = 1;\n",
    "promises.ts": PROMISES,
  });
  const run = async (file: string): Promise<{ code: number; lines: string[] }> => {
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--config", `${REPO}/deno.json`, "--allow-read", "--allow-run", "--allow-env", SCRIPT, file],
      cwd: root,
    }).output();
    return { code: output.code, lines: new TextDecoder().decode(output.stdout).trim().split("\n") };
  };
  const dirty = await run("first.ts");
  assertEquals([dirty.code, dirty.lines.length, dirty.lines[0]], [1, 8, "first.ts:2:36 value[0]"]);
  const floating = await run("promises.ts");
  assertEquals([floating.code, floating.lines.at(-1)], [
    1,
    "7 of 10 expression statements leave a promise that no code awaits.",
  ]);
  const clean = await run("fine.ts");
  assertEquals(clean, {
    code: 0,
    lines: [
      "Type coverage is 100.00%. 0 of 1 values have a type that contains any.",
      "0 of 0 expression statements leave a promise that no code awaits.",
    ],
  });
  assertStringIncludes(dirty.lines.join("\n"), "6 of 21 values");
});
