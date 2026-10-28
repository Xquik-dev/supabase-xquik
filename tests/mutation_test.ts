import { assertEquals, assertRejects } from "@std/assert";
import { type Mutant, mutantsOf, type Result, runMutants, score, summary } from "../scripts/mutation.ts";

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

const NOTES = "create function one() returns int language sql as $$ select 1 $$;\n";

const MATH_TEST = `import { add } from "../math.ts";
Deno.test("adds", () => {
  if (add(2, 3) !== 5) throw new Error("add is wrong");
});
Deno.test("keeps the notes with every permission", async () => {
  if (!(await Deno.readTextFile("notes.sql")).includes("select 1 ")) throw new Error("notes changed");
  await Deno.writeTextFile(await Deno.makeTempFile(), Deno.env.get("NO_COLOR") ?? "");
  await new Deno.Command(Deno.execPath(), { args: ["--version"] }).output();
  Deno.listen({ hostname: "127.0.0.1", port: 0 }).close();
});
`;

function changes(mutants: readonly Mutant[]): (readonly [number, string, string])[] {
  return mutants.map(({ line, original, replacement }) => [line, original, replacement]);
}

async function fixture(test: string): Promise<string> {
  const root = await Deno.makeTempDir();
  await Deno.mkdir(`${root}/tests`);
  await Deno.mkdir(`${root}/.git`);
  await Deno.mkdir(`${root}/node_modules`);
  await Deno.writeTextFile(`${root}/.git/HEAD`, "ref: refs/heads/main\n");
  await Deno.writeTextFile(`${root}/math.ts`, MATH);
  await Deno.writeTextFile(`${root}/notes.sql`, NOTES);
  await Deno.writeTextFile(`${root}/tests/math_test.ts`, test);
  return root;
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
  ]);
});

Deno.test("runs the tests that load the file of each mutant in a copy, all tests for SQL, and leaves the tree as it was", async () => {
  const root = await fixture(MATH_TEST);
  const mutants = [...mutantsOf("math.ts", MATH), ...mutantsOf("notes.sql", NOTES)];
  const results = await runMutants(root, mutants, ["tests/math_test.ts"], 2);
  assertEquals(results.map(({ mutant, outcome }) => [mutant.original, outcome]), [
    ["+", "killed"],
    ["+", "invalid"],
    ['"a"', "survived"],
    ['"b"', "survived"],
    ["true", "survived"],
    ["1", "killed"],
  ]);
  assertEquals(await Deno.readTextFile(`${root}/math.ts`), MATH);
  await Deno.remove(root, { recursive: true });
});

Deno.test("refuses to mutate when the tests fail before any mutation", async () => {
  const root = await fixture(MATH_TEST.replace("!== 5", "!== 6"));
  await assertRejects(
    () => runMutants(root, mutantsOf("math.ts", MATH), ["tests/math_test.ts"], 1),
    Error,
    "tests/math_test.ts fails before any mutation.",
  );
  await Deno.remove(root, { recursive: true });
});

Deno.test("scores 100% when no mutant counts", () => {
  assertEquals(
    summary([]),
    [
      "Mutation score is 100.00%.",
      "The tests killed 0 of 0 mutants that compiled.",
      "0 of 0 mutants did not compile.",
    ].join(" "),
  );
});

Deno.test("scores the percentage the summary prints, rounded to 2 decimals", () => {
  const mutant: Mutant = { file: "math.ts", line: 2, start: 50, end: 51, original: "+", replacement: "-" };
  const results: Result[] = [{ mutant, outcome: "killed" }, { mutant, outcome: "killed" }, {
    mutant,
    outcome: "survived",
  }];
  assertEquals(score(results), 66.67);
  assertEquals(
    summary(results).split("\n").at(-1),
    "Mutation score is 66.67%. The tests killed 2 of 3 mutants that compiled. 0 of 3 mutants did not compile.",
  );
});

Deno.test("the command lists each survivor and exits 1 only below the minimum score", async () => {
  const root = await fixture(MATH_TEST);
  const run = async (minimum: string): Promise<{ code: number; lines: string[] }> => {
    const output = await new Deno.Command(Deno.execPath(), {
      args: [
        ...["run", "--config", `${REPO}/deno.json`],
        ...["--allow-read", "--allow-write", "--allow-run", "--allow-env", SCRIPT, minimum, "math.ts"],
      ],
      cwd: root,
    }).output();
    return { code: output.code, lines: new TextDecoder().decode(output.stdout).trim().split("\n") };
  };
  const survivors = [
    'math.ts:4 replaces "\\"a\\"" with "\\"\\"", and every test still passes.',
    'math.ts:4 replaces "\\"b\\"" with "\\"\\"", and every test still passes.',
    'math.ts:6 replaces "true" with "false", and every test still passes.',
    "Mutation score is 25.00%. The tests killed 1 of 4 mutants that compiled. 1 of 5 mutants did not compile.",
  ];
  assertEquals(await run("25"), { code: 0, lines: survivors });
  assertEquals(await run("25.01"), { code: 1, lines: survivors });
  await Deno.remove(root, { recursive: true });
});
