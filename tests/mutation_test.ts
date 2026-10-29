import { assertEquals, assertRejects } from "@std/assert";
import type { Equivalent, Mutant } from "@/scripts/mutants.ts";
import { mutantTimeoutMs, runMutants, score, summary } from "@/scripts/mutation.ts";
import { mutantsOf } from "@/scripts/mutants.ts";
import readDir from "@/scripts/read_dir.ts";
import type { Result } from "@/scripts/mutation.ts";

const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/u, "");
const SCRIPT = `${REPO}/scripts/mutate.ts`;
const ONE_WORKER = 1;
const TWO_WORKERS = 2;
const LAST = -1;
const FROM_SECOND = 1;
const MANY_KILLED = 19_999;
const NO_EQUIVALENTS = 0;
const ONE_EQUIVALENT = 1;

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

const WORKERS_TEST = `Deno.test("runs in 1 of N copies, where N is the CPU thread count", () => {
  const copies = [...Deno.readDirSync("..")].filter(({ name }) => /^\\d+$/.test(name)).length;
  if (copies !== navigator.hardwareConcurrency) throw new Error(\`\${copies} copies\`);
});
`;

async function fixture(tests: Readonly<Record<string, string>>): Promise<string> {
  const root = await Deno.makeTempDir();
  await Deno.mkdir(`${root}/tests`);
  await Deno.mkdir(`${root}/.git`);
  await Deno.mkdir(`${root}/node_modules`);
  await Deno.writeTextFile(`${root}/.git/HEAD`, "ref: refs/heads/main\n");
  await Deno.writeTextFile(`${root}/math.ts`, MATH);
  await Deno.writeTextFile(`${root}/notes.sql`, NOTES);
  await Deno.writeTextFile(`${root}/unlisted_test.ts`, UNLISTED_TEST);
  await Promise.all(
    Object.entries(tests).map(async ([name, text]): Promise<void> => {
      await Deno.writeTextFile(`${root}/tests/${name}`, text);
    }),
  );
  return root;
}

function restore(name: string, value: string | undefined): void {
  if (typeof value === "string") {
    Deno.env.set(name, value);
  } else {
    Deno.env.delete(name);
  }
}

async function withEnv<Output>(vars: Readonly<Record<string, string>>, work: () => Promise<Output>): Promise<Output> {
  const outer = Object.keys(vars).map((name) => [name, Deno.env.get(name)] as const);
  for (const [name, value] of Object.entries(vars)) {
    Deno.env.set(name, value);
  }
  try {
    return await work();
  } finally {
    for (const [name, value] of outer) {
      restore(name, value);
    }
  }
}

Deno.test("gives each mutant 10 seconds plus 5 times the baseline time of its tests", () => {
  const baselineMs = { fast: 100, slow: 200 };
  assertEquals(
    { both: mutantTimeoutMs([baselineMs.fast, baselineMs.slow]), none: mutantTimeoutMs([]) },
    { both: 11_500, none: 10_000 },
  );
});

Deno.test("runs the listed tests that load the file of each mutant, every listed test for SQL, and leaves no trace", async () => {
  const root = await fixture({ "math_test.ts": MATH_TEST, "text_test.ts": TEXT_TEST });
  const [scratch, coverage] = await Promise.all([Deno.makeTempDir(), Deno.makeTempDir()]);
  const mutants = [...mutantsOf("math.ts", MATH), ...mutantsOf("notes.sql", NOTES)];
  const tests = ["tests/math_test.ts", "tests/text_test.ts"];
  const results = await withEnv(
    { DENO_COVERAGE_DIR: coverage, TMPDIR: scratch },
    async () => await runMutants(root, mutants, tests, TWO_WORKERS),
  );
  assertEquals(results.map(({ mutant, outcome }) => [mutant.original, outcome]), [
    ["+", "killed"],
    ["+", "invalid"],
    ['"a"', "survived"],
    ['"b"', "survived"],
    ["true", "survived"],
    ["1", "killed"],
    ["2", "survived"],
  ]);
  const leftovers = await Promise.all([Array.fromAsync(readDir(scratch)), Array.fromAsync(readDir(coverage))]);
  assertEquals(leftovers.flat(), []);
  assertEquals(await Deno.readTextFile(`${root}/math.ts`), MATH);
  await Deno.remove(root, { recursive: true });
});

Deno.test("refuses to mutate when the tests fail before any mutation", async () => {
  const root = await fixture({ "math_test.ts": MATH_TEST.replace("!== 5", "!== 6") });
  await assertRejects(
    async () => await runMutants(root, mutantsOf("math.ts", MATH), ["tests/math_test.ts"], ONE_WORKER),
    Error,
    "tests/math_test.ts fails before any mutation.",
  );
  await Deno.remove(root, { recursive: true });
});

Deno.test("scores 100% when no mutant counts", () => {
  assertEquals(
    summary([], NO_EQUIVALENTS),
    [
      "Mutation score is 100.00%.",
      "The tests killed 0 of 0 mutants that compiled.",
      "0 of 0 mutants are equivalent and 0 did not compile.",
    ].join(" "),
  );
});

Deno.test("scores the percentage the summary prints, rounded down to 2 decimals so 1 survivor stays below 100%", () => {
  const mutant: Mutant = { end: 51, file: "math.ts", line: 2, original: "+", replacement: "-", start: 50 };
  const killed: Result = { mutant, outcome: "killed" };
  const results: Result[] = [killed, killed, { mutant, outcome: "survived" }];
  const nearlyAll = [...Array.from({ length: MANY_KILLED }, () => killed), ...results.slice(LAST)];
  assertEquals(
    { half: score(results.slice(FROM_SECOND)), nearlyAll: score(nearlyAll), twoOfThree: score(results) },
    { half: 50, nearlyAll: 99.99, twoOfThree: 66.66 },
  );
  assertEquals(
    summary(results, ONE_EQUIVALENT).split("\n").at(LAST),
    "Mutation score is 66.66%. The tests killed 2 of 3 mutants that compiled. 1 of 4 mutants are equivalent and 0 did not compile.",
  );
});

Deno.test("the command sets aside equivalent mutants, lists each survivor and exits 1 below the minimum score", async () => {
  const root = await fixture({
    "helper.ts": 'throw new Error("deno test ran a module that is not a test");\n',
    "math_test.ts": MATH_TEST,
    "text_test.ts": TEXT_TEST,
    "workers_test.ts": WORKERS_TEST,
  });
  const unused = { context: "return true", file: "math.ts", original: "true", reason: "Unused.", replacement: "false" };
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
    String.raw`math.ts:4 replaces "\"a\"" with "\"\"", and every test still passes.`,
    String.raw`math.ts:4 replaces "\"b\"" with "\"\"", and every test still passes.`,
    "Mutation score is 33.33%. The tests killed 1 of 3 mutants that compiled. 1 of 5 mutants are equivalent and 1 did not compile.",
  ];
  assertEquals(await run("33.33", [unused]), { code: 0, lines: survivors });
  assertEquals(await run("33.34", [unused]), { code: 1, lines: survivors });
  const ending = "and an equivalent entry must name exactly 1.";
  const stale = [{ ...unused, context: "return false" }, { ...unused, context: "+", original: "+", replacement: "-" }];
  assertEquals(await run("0", stale), {
    code: 1,
    lines: [
      `math.ts has 0 mutants that replace "true" with "false" inside "return false", ${ending}`,
      `math.ts has 2 mutants that replace "+" with "-" inside "+", ${ending}`,
    ],
  });
  await Deno.remove(root, { recursive: true });
});
