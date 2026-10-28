import { assertEquals, assertRejects } from "@std/assert";
import { runMutants, score, summary } from "@/scripts/mutation.ts";
import type { Mutant } from "@/scripts/mutants.ts";
import mutantsOf from "@/scripts/mutants.ts";
import type { Result } from "@/scripts/mutation.ts";

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/u, "");
const SCRIPT = `${REPO}/scripts/mutate.ts`;
const GUARD_LINE = 4;
const LOG_LINE = 5;
const OPERATORS_LINE = 6;
const RETURN_LINE = 7;
const SQL_IF_LINE = 4;
const SQL_FOUND_LINE = 5;
const SQL_CASE_LINE = 6;
const SQL_CHAIN_LINE = 7;
const ONE_WORKER = 1;
const TWO_WORKERS = 2;
const TWO_THIRDS_SCORE = 66.67;
const LAST = -1;

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

function changes(mutants: readonly Mutant[]): Array<readonly [number, string, string]> {
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
    [GUARD_LINE, "!on", "true"],
    [GUARD_LINE, "!on", "false"],
    [GUARD_LINE, "!", ""],
    [GUARD_LINE, `\`\${a}\``, '""'],
    [LOG_LINE, 'log({ "key": false });', ";"],
    [LOG_LINE, "false", "true"],
    [OPERATORS_LINE, "===", "!=="],
    [OPERATORS_LINE, "!==", "==="],
    [OPERATORS_LINE, "<=", "<"],
    [OPERATORS_LINE, ">=", ">"],
    [OPERATORS_LINE, ">", ">="],
    [OPERATORS_LINE, "||", "&&"],
    [OPERATORS_LINE, "??", "&&"],
    [OPERATORS_LINE, "-", "+"],
    [OPERATORS_LINE, "+", "-"],
    [OPERATORS_LINE, "/", "*"],
    [OPERATORS_LINE, "*", "/"],
    [RETURN_LINE, "a < b && on", "true"],
    [RETURN_LINE, "a < b && on", "false"],
    [RETURN_LINE, "&&", "||"],
    [RETURN_LINE, "<", "<="],
    [RETURN_LINE, '"less"', '""'],
    [RETURN_LINE, '""', '"mutant"'],
  ]);
});

Deno.test("lists SQL mutants inside function bodies only, and none inside a string", () => {
  assertEquals(changes(mutantsOf("f.sql", SQL)), [
    [SQL_IF_LINE, " = ", " <> "],
    [SQL_IF_LINE, "1", "2"],
    [SQL_IF_LINE, " and ", " or "],
    [SQL_IF_LINE, " is not null", " is null"],
    [SQL_IF_LINE, "'one = 1'", "''"],
    [SQL_FOUND_LINE, "not found", "found"],
    [SQL_FOUND_LINE, "''", "'mutant'"],
    [SQL_CASE_LINE, " between ", " not between "],
    [SQL_CASE_LINE, "2", "3"],
    [SQL_CASE_LINE, "3", "4"],
    [SQL_CASE_LINE, "'few'", "''"],
    [SQL_CHAIN_LINE, " <> ", " = "],
    [SQL_CHAIN_LINE, "1", "2"],
    [SQL_CHAIN_LINE, " or ", " and "],
    [SQL_CHAIN_LINE, " < ", " <= "],
    [SQL_CHAIN_LINE, "2", "3"],
    [SQL_CHAIN_LINE, " or ", " and "],
    [SQL_CHAIN_LINE, " <= ", " < "],
    [SQL_CHAIN_LINE, "3", "4"],
    [SQL_CHAIN_LINE, " or ", " and "],
    [SQL_CHAIN_LINE, " > ", " >= "],
    [SQL_CHAIN_LINE, "4", "5"],
    [SQL_CHAIN_LINE, " or ", " and "],
    [SQL_CHAIN_LINE, " >= ", " > "],
    [SQL_CHAIN_LINE, "5", "6"],
    [SQL_CHAIN_LINE, " or ", " and "],
    [SQL_CHAIN_LINE, " is null", " is not null"],
    [SQL_CHAIN_LINE, " or ", " and "],
    [SQL_CHAIN_LINE, " not between ", " between "],
    [SQL_CHAIN_LINE, "6", "7"],
    [SQL_CHAIN_LINE, "7", "8"],
    [SQL_CHAIN_LINE, " or ", " and "],
    [SQL_CHAIN_LINE, " in (", " not in ("],
    [SQL_CHAIN_LINE, "8", "9"],
    [SQL_CHAIN_LINE, " or ", " and "],
    [SQL_CHAIN_LINE, " not in (", " in ("],
    [SQL_CHAIN_LINE, "9", "10"],
  ]);
});

Deno.test("runs the tests that load the file of each mutant in a copy, all tests for SQL, and leaves the tree as it was", async () => {
  const root = await fixture(MATH_TEST);
  const mutants = [...mutantsOf("math.ts", MATH), ...mutantsOf("notes.sql", NOTES)];
  const results = await runMutants(root, mutants, ["tests/math_test.ts"], TWO_WORKERS);
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
    async () => await runMutants(root, mutantsOf("math.ts", MATH), ["tests/math_test.ts"], ONE_WORKER),
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
  const mutant: Mutant = { end: 51, file: "math.ts", line: 2, original: "+", replacement: "-", start: 50 };
  const results: Result[] = [{ mutant, outcome: "killed" }, { mutant, outcome: "killed" }, {
    mutant,
    outcome: "survived",
  }];
  assertEquals(score(results), TWO_THIRDS_SCORE);
  assertEquals(
    summary(results).split("\n").at(LAST),
    "Mutation score is 66.67%. The tests killed 2 of 3 mutants that compiled. 0 of 3 mutants did not compile.",
  );
});

Deno.test("the command lists each survivor and exits 1 only below the minimum score", async () => {
  const root = await fixture(MATH_TEST);
  const run = async (minimum: string): Promise<{ code: number; lines: string[] }> => {
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
        "math.ts",
      ],
      cwd: root,
    }).output();
    return { code: output.code, lines: new TextDecoder().decode(output.stdout).trim().split("\n") };
  };
  const survivors = [
    String.raw`math.ts:4 replaces "\"a\"" with "\"\"", and every test still passes.`,
    String.raw`math.ts:4 replaces "\"b\"" with "\"\"", and every test still passes.`,
    'math.ts:6 replaces "true" with "false", and every test still passes.',
    "Mutation score is 25.00%. The tests killed 1 of 4 mutants that compiled. 1 of 5 mutants did not compile.",
  ];
  assertEquals(await run("25"), { code: 0, lines: survivors });
  assertEquals(await run("25.01"), { code: 1, lines: survivors });
  await Deno.remove(root, { recursive: true });
});
