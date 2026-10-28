import { assertEquals, assertRejects } from "@std/assert";
import {
  type Equivalent,
  type Mutant,
  mutantsOf,
  mutantTimeoutMs,
  plan,
  type Result,
  runMutants,
  score,
  summary,
} from "../scripts/mutation.ts";

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SCRIPT = `${REPO}/scripts/mutate.ts`;

const TYPESCRIPT = `import { log } from "./log.ts";
type Flag = "on" | true;
export function pick(a: number, b: number, on: boolean): string {
  if (!on) return \`\${a}\`;
  log({ "key": false });
  const all = [a === b, a !== b, a <= b, a >= b, a > b, a || b, a ?? b, a + b - a * b / a];
  return a < b && on ? "less" : "";
}
`;

const SQL = `create table t (a int check (a = 1));
create function f(x int) returns text language plpgsql as $$
begin
  if x = 1 and x is not null then return 'one = 1'; end if;
  if not found then return ''; end if;
  return case when x between 2 and 3 then 'few' end;
  if x <> 1 or x < 2 or x <= 3 or x > 4 or x >= 5 or x is null or x not between 6 and 7 or x in (8) or x not in (9) then
    return null;
  end if;
  return 'a' = 'b';
end;
$$;
`;

const MATH = `export function add(a: number, b: number): number {
  return a + b;
}
export const word: string = "a" + "b";
export function unused(): boolean {
  return true;
}
`;

const NOTES = [
  "create function one() returns int language sql as $$ select 1 $$;",
  "create function two() returns int language sql as $$ select 2 $$;",
  "",
].join("\n");

const MATH_TEST = `import { add } from "../math.ts";
Deno.test("adds", () => {
  if (add(2, 3) !== 5) throw new Error("add is wrong");
});
Deno.test("runs in a copy without .git, with node_modules linked and every permission", async () => {
  if (!(await Deno.readTextFile("notes.sql")).includes("select 1 ")) throw new Error("notes changed");
  const names = [...Deno.readDirSync(".")].map(({ name }) => name).toSorted().join(" ");
  if (names !== "math.ts node_modules notes.sql tests unlisted_test.ts") throw new Error(\`the copy holds \${names}\`);
  if (!Deno.lstatSync("node_modules").isSymlink) throw new Error("the copy holds its own node_modules");
  if (!/\\/xquik-mutation-[^/]+\\/\\d+$/.test(Deno.cwd())) throw new Error(\`the copy is at \${Deno.cwd()}\`);
  await Deno.writeTextFile(await Deno.makeTempFile(), Object.keys(Deno.env.toObject()).join());
  await new Deno.Command(Deno.execPath(), { args: ["--version"] }).output();
  Deno.listen({ hostname: "127.0.0.1", port: 0 }).close();
});
`;

const TEXT_TEST = `Deno.test("reads math.ts as text, so it never loads the module", async () => {
  if (await Deno.readTextFile("math.ts") !== \`${MATH}\`) throw new Error("math.ts changed");
});
`;

const UNLISTED_TEST = `Deno.test("runs only when deno test gets no test to run", () => {
  throw new Error("deno test found a test that the caller did not list");
});
`;

const WORKERS_TEST = `Deno.test("runs in 1 of half as many copies as the machine has threads", () => {
  const copies = [...Deno.readDirSync("..")].filter(({ name }) => /^\\d+$/.test(name)).length;
  if (copies !== Math.max(1, Math.floor(navigator.hardwareConcurrency / 2))) throw new Error(\`\${copies} copies\`);
});
`;

const TWINS = `export const x = f(1) === 2 ? "yes" : "no";\nexport const y = f(1) === 2;\n`;
const WORKERS = { one: 1, two: 2 };

function changes(mutants: readonly Mutant[]): (readonly [number, string, string])[] {
  return mutants.map(({ line, original, replacement }) => [line, original, replacement]);
}

async function fixture(tests: Readonly<Record<string, string>>): Promise<string> {
  const root = await Deno.makeTempDir();
  await Deno.mkdir(`${root}/tests`);
  await Deno.mkdir(`${root}/.git`);
  await Deno.mkdir(`${root}/node_modules`);
  await Deno.writeTextFile(`${root}/.git/HEAD`, "ref: refs/heads/main\n");
  await Deno.writeTextFile(`${root}/math.ts`, MATH);
  await Deno.writeTextFile(`${root}/notes.sql`, NOTES);
  await Deno.writeTextFile(`${root}/unlisted_test.ts`, UNLISTED_TEST);
  for (const [name, text] of Object.entries(tests)) await Deno.writeTextFile(`${root}/tests/${name}`, text);
  return root;
}

function names(dir: string): string[] {
  return Deno.readDirSync(dir).map(({ name }) => name).toArray();
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) Deno.env.delete(name);
  else Deno.env.set(name, value);
}

Deno.test("lists a mutant per operator, condition, boolean, string and statement, outside types and imports", () => {
  assertEquals(changes(mutantsOf("pick.ts", TYPESCRIPT)), [
    [4, "!on", "true"],
    [4, "!on", "false"],
    [4, "!", ""],
    [4, "`${a}`", '""'],
    [5, 'log({ "key": false });', ";"],
    [5, "false", "true"],
    [6, "===", "!=="],
    [6, "!==", "==="],
    [6, "<=", "<"],
    [6, ">=", ">"],
    [6, ">", ">="],
    [6, "||", "&&"],
    [6, "??", "&&"],
    [6, "-", "+"],
    [6, "+", "-"],
    [6, "/", "*"],
    [6, "*", "/"],
    [7, "a < b && on", "true"],
    [7, "a < b && on", "false"],
    [7, "&&", "||"],
    [7, "<", "<="],
    [7, '"less"', '""'],
    [7, '""', '"mutant"'],
  ]);
});

Deno.test("lists SQL mutants inside function bodies only, and none inside a string", () => {
  assertEquals(changes(mutantsOf("f.sql", SQL)), [
    [4, " = ", " <> "],
    [4, "1", "2"],
    [4, " and ", " or "],
    [4, " is not null", " is null"],
    [4, "'one = 1'", "''"],
    [5, "not found", "found"],
    [5, "''", "'mutant'"],
    [6, " between ", " not between "],
    [6, "2", "3"],
    [6, "3", "4"],
    [6, "'few'", "''"],
    [7, " <> ", " = "],
    [7, "1", "2"],
    [7, " or ", " and "],
    [7, " < ", " <= "],
    [7, "2", "3"],
    [7, " or ", " and "],
    [7, " <= ", " < "],
    [7, "3", "4"],
    [7, " or ", " and "],
    [7, " > ", " >= "],
    [7, "4", "5"],
    [7, " or ", " and "],
    [7, " >= ", " > "],
    [7, "5", "6"],
    [7, " or ", " and "],
    [7, " is null", " is not null"],
    [7, " or ", " and "],
    [7, " not between ", " between "],
    [7, "6", "7"],
    [7, "7", "8"],
    [7, " or ", " and "],
    [7, " in (", " not in ("],
    [7, "8", "9"],
    [7, " or ", " and "],
    [7, " not in (", " in ("],
    [7, "9", "10"],
    [10, "'a'", "''"],
    [10, " = ", " <> "],
    [10, "'b'", "''"],
  ]);
});

Deno.test("each mutant replaces exactly the text it names", () => {
  const sources = {
    "a.ts": "export const a = 1 + 2;\n",
    "f.sql": "create function f() returns bool as $$ select 1 = 2 $$;\n",
  };
  const mutated = Object.entries(sources).flatMap(([file, text]) =>
    mutantsOf(file, text).map(({ start, end, replacement }) => text.slice(0, start) + replacement + text.slice(end))
  );
  assertEquals(mutated, [
    "export const a = 1 - 2;\n",
    "create function f() returns bool as $$ select 2 = 2 $$;\n",
    "create function f() returns bool as $$ select 1 <> 2 $$;\n",
    "create function f() returns bool as $$ select 1 = 3 $$;\n",
  ]);
});

Deno.test("plan sets aside the mutant each equivalent entry names and lists each entry that names 0 or several", () => {
  const entry: Equivalent = {
    file: "a.ts",
    context: "x = f(1) === 2",
    original: "===",
    replacement: "!==",
    reason: "r",
  };
  const entries = [
    entry,
    { ...entry, context: '"yes"', original: '"yes"', replacement: '""' },
    { ...entry, context: "f(1)\n===   2" },
    { ...entry, file: "c.ts" },
    { ...entry, replacement: "===" },
    { ...entry, original: "==" },
  ];
  const { mutants, equivalent, stale } = plan(new Map([["a.ts", TWINS], ["b.ts", TWINS]]), entries);
  const ending = "and an equivalent entry must name exactly 1.";
  assertEquals({ equivalent, stale }, {
    equivalent: 2,
    stale: [
      `a.ts has 2 mutants that replace "===" with "!==" inside "f(1)\\n===   2", ${ending}`,
      `c.ts has 0 mutants that replace "===" with "!==" inside "x = f(1) === 2", ${ending}`,
      `a.ts has 0 mutants that replace "===" with "===" inside "x = f(1) === 2", ${ending}`,
      `a.ts has 0 mutants that replace "==" with "!==" inside "x = f(1) === 2", ${ending}`,
    ],
  });
  assertEquals(
    mutants.map(({ file, line, original, replacement }) => `${file}:${String(line)} ${original} ${replacement}`),
    [
      "a.ts:1 f(1) === 2 true",
      "a.ts:1 f(1) === 2 false",
      'a.ts:1 "no" ""',
      "a.ts:2 === !==",
      "b.ts:1 f(1) === 2 true",
      "b.ts:1 f(1) === 2 false",
      "b.ts:1 === !==",
      'b.ts:1 "yes" ""',
      'b.ts:1 "no" ""',
      "b.ts:2 === !==",
    ],
  );
});

Deno.test("gives each mutant 10 seconds plus 5 times the baseline time of its tests", () => {
  const baselineMs = { fast: 100, slow: 200 };
  assertEquals(
    { none: mutantTimeoutMs([]), both: mutantTimeoutMs([baselineMs.fast, baselineMs.slow]) },
    { none: 10_000, both: 11_500 },
  );
});

Deno.test("runs the listed tests that load the file of each mutant, every listed test for SQL, and leaves no trace", async () => {
  const root = await fixture({ "math_test.ts": MATH_TEST, "text_test.ts": TEXT_TEST });
  const scratch = await Deno.makeTempDir();
  const coverage = await Deno.makeTempDir();
  const outer = { tmp: Deno.env.get("TMPDIR"), coverage: Deno.env.get("DENO_COVERAGE_DIR") };
  Deno.env.set("TMPDIR", scratch);
  Deno.env.set("DENO_COVERAGE_DIR", coverage);
  try {
    const mutants = [...mutantsOf("math.ts", MATH), ...mutantsOf("notes.sql", NOTES)];
    const results = await runMutants(root, mutants, ["tests/math_test.ts", "tests/text_test.ts"], WORKERS.two);
    assertEquals(results.map(({ mutant, outcome }) => [mutant.original, outcome]), [
      ["+", "killed"],
      ["+", "invalid"],
      ['"a"', "survived"],
      ['"b"', "survived"],
      ["true", "survived"],
      ["1", "killed"],
      ["2", "survived"],
    ]);
  } finally {
    restore("TMPDIR", outer.tmp);
    restore("DENO_COVERAGE_DIR", outer.coverage);
  }
  assertEquals([...names(scratch), ...names(coverage)], []);
  assertEquals(await Deno.readTextFile(`${root}/math.ts`), MATH);
  await Deno.remove(root, { recursive: true });
});

Deno.test("refuses to mutate when the tests fail before any mutation", async () => {
  const root = await fixture({ "math_test.ts": MATH_TEST.replace("!== 5", "!== 6") });
  await assertRejects(
    async () => await runMutants(root, mutantsOf("math.ts", MATH), ["tests/math_test.ts"], WORKERS.one),
    Error,
    "tests/math_test.ts fails before any mutation.",
  );
  await Deno.remove(root, { recursive: true });
});

Deno.test("scores 100% when no mutant counts", () => {
  assertEquals(
    summary([], 0),
    [
      "Mutation score is 100.00%.",
      "The tests killed 0 of 0 mutants that compiled.",
      "0 of 0 mutants are equivalent and 0 did not compile.",
    ].join(" "),
  );
});

Deno.test("scores the percentage the summary prints, rounded down to 2 decimals so 1 survivor stays below 100%", () => {
  const mutant: Mutant = { file: "math.ts", line: 2, start: 50, end: 51, original: "+", replacement: "-" };
  const killed: Result = { mutant, outcome: "killed" };
  const results: Result[] = [killed, killed, { mutant, outcome: "survived" }];
  const many = { killed: 19_999 };
  const nearlyAll = [...Array.from({ length: many.killed }, () => killed), ...results.slice(-1)];
  assertEquals(
    { twoOfThree: score(results), half: score(results.slice(1)), nearlyAll: score(nearlyAll) },
    { twoOfThree: 66.66, half: 50, nearlyAll: 99.99 },
  );
  assertEquals(
    summary(results, 1).split("\n").at(-1),
    "Mutation score is 66.66%. The tests killed 2 of 3 mutants that compiled. 1 of 4 mutants are equivalent and 0 did not compile.",
  );
});

Deno.test("the command sets aside equivalent mutants, lists each survivor and exits 1 below the minimum score", async () => {
  const root = await fixture({
    "math_test.ts": MATH_TEST,
    "text_test.ts": TEXT_TEST,
    "workers_test.ts": WORKERS_TEST,
    "helper.ts": 'throw new Error("deno test ran a module that is not a test");\n',
  });
  const unused = { file: "math.ts", context: "return true", original: "true", replacement: "false", reason: "Unused." };
  const run = async (minimum: string, entries: readonly Equivalent[]): Promise<{ code: number; lines: string[] }> => {
    const list = await Deno.makeTempFile({ suffix: ".json" });
    await Deno.writeTextFile(list, JSON.stringify(entries));
    const output = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--config",
        `${REPO}/deno.json`,
        "--allow-read",
        "--allow-write",
        "--allow-run",
        "--allow-env",
        SCRIPT,
        minimum,
        list,
        "math.ts",
      ],
      cwd: root,
    }).output();
    return { code: output.code, lines: new TextDecoder().decode(output.stdout).trim().split("\n") };
  };
  const survivors = [
    'math.ts:4 replaces "\\"a\\"" with "\\"\\"", and every test still passes.',
    'math.ts:4 replaces "\\"b\\"" with "\\"\\"", and every test still passes.',
    "Mutation score is 33.33%. The tests killed 1 of 3 mutants that compiled. 1 of 5 mutants are equivalent and 1 did not compile.",
  ];
  assertEquals(await run("33.33", [unused]), { code: 0, lines: survivors });
  assertEquals(await run("33.34", [unused]), { code: 1, lines: survivors });
  const ending = "and an equivalent entry must name exactly 1.";
  assertEquals(
    await run("0", [{ ...unused, context: "return false" }, {
      ...unused,
      context: "+",
      original: "+",
      replacement: "-",
    }]),
    {
      code: 1,
      lines: [
        `math.ts has 0 mutants that replace "true" with "false" inside "return false", ${ending}`,
        `math.ts has 2 mutants that replace "+" with "-" inside "+", ${ending}`,
      ],
    },
  );
  await Deno.remove(root, { recursive: true });
});
