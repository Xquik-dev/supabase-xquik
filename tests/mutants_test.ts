import type { Equivalent, Mutant } from "@/scripts/mutants.ts";
import { mutantsOf, plan } from "@/scripts/mutants.ts";
import { assertEquals } from "@std/assert";

const GUARD_LINE = 4;
const LOG_LINE = 5;
const OPERATORS_LINE = 6;
const RETURN_LINE = 7;
const SQL_IF_LINE = 4;
const SQL_FOUND_LINE = 5;
const SQL_CASE_LINE = 6;
const SQL_CHAIN_LINE = 7;
const SQL_RETURN_LINE = 10;
const TEXT_START = 0;

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

const TWINS = `export const x = f(1) === 2 ? "yes" : "no";\nexport const y = f(1) === 2;\n`;

function changes(mutants: readonly Mutant[]): Array<readonly [number, string, string]> {
  return mutants.map(({ line, original, replacement }) => [line, original, replacement]);
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
    [SQL_RETURN_LINE, "'a'", "''"],
    [SQL_RETURN_LINE, " = ", " <> "],
    [SQL_RETURN_LINE, "'b'", "''"],
  ]);
});

Deno.test("each mutant replaces exactly the text it names", () => {
  const sources = {
    "a.ts": "export const a = 1 + 2;\n",
    "f.sql": "create function f() returns bool as $$ select 1 = 2 $$;\n",
  };
  const mutated = Object.entries(sources).flatMap(([file, text]) =>
    mutantsOf(file, text).map(({ start, end, replacement }) =>
      text.slice(TEXT_START, start) + replacement + text.slice(end)
    )
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
    context: "x = f(1) === 2",
    file: "a.ts",
    original: "===",
    reason: "r",
    replacement: "!==",
  };
  const entries = [
    entry,
    { ...entry, context: '"yes"', original: '"yes"', replacement: '""' },
    { ...entry, context: "f(1)\n===   2" },
    { ...entry, file: "c.ts" },
    { ...entry, replacement: "===" },
    { ...entry, original: "==" },
  ];
  const { equivalent, mutants, stale } = plan(new Map([["a.ts", TWINS], ["b.ts", TWINS]]), entries);
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
