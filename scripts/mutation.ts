import type { Mutant } from "./mutants.ts";
import readDir from "./read_dir.ts";

type Outcome = "killed" | "survived" | "invalid";
interface Result {
  readonly mutant: Mutant;
  readonly outcome: Outcome;
}

const TEST_PERMISSIONS = ["--allow-read", "--allow-write", "--allow-run", "--allow-env", "--allow-net"];
const RAN_TESTS = /^running \d+ tests? from /mu;
const TIMEOUT_FACTOR = 5;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINIMUM_TIMEOUT_SECONDS = 10;
const BASELINE_TIMEOUT_MINUTES = 30;
const MINIMUM_TIMEOUT_MS = MINIMUM_TIMEOUT_SECONDS * MS_PER_SECOND;
const BASELINE_TIMEOUT_MS = BASELINE_TIMEOUT_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
const NONE = 0;
const TEXT_START = 0;
const MINIMUM_WORKERS = 1;
const FULL_SCORE = 100;
const HUNDREDTHS_PER_WHOLE = 10_000;
const HUNDREDTHS_PER_PERCENT = 100;
const SCORE_DECIMALS = 2;

async function copyTree(from: string, to: string): Promise<void> {
  await Deno.mkdir(to, { recursive: true });
  const entries = await Array.fromAsync(readDir(from));
  await Promise.all(entries.map(async (entry): Promise<void> => {
    const source = `${from}/${entry.name}`;
    const target = `${to}/${entry.name}`;
    if (entry.name === "node_modules") {
      await Deno.symlink(source, target);
    } else if (entry.isDirectory && entry.name !== ".git") {
      await copyTree(source, target);
    } else if (entry.isFile) {
      await Deno.copyFile(source, target);
    }
  }));
}

interface TestRun {
  readonly passed: boolean;
  readonly compiled: boolean;
  readonly output: string;
  readonly ms: number;
}
interface Covered {
  readonly test: string;
  readonly ms: number;
  readonly files: ReadonlySet<string>;
}

function coverageEnv(report: string): Record<string, string> {
  if (report === "") {
    return {};
  }
  return { DENO_COVERAGE_DIR: report };
}

async function runTests(dir: string, tests: readonly string[], timeoutMs: number, report = ""): Promise<TestRun> {
  const env = Deno.env.toObject();
  delete env["DENO_COVERAGE_DIR"];
  const started = performance.now();
  const { success, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["test", "--fail-fast", ...TEST_PERMISSIONS, ...tests],
    clearEnv: true,
    cwd: dir,
    env: { ...env, ...coverageEnv(report), NO_COLOR: "1", TMPDIR: `${dir}.tmp` },
    signal: AbortSignal.timeout(timeoutMs),
  }).output();
  const decoder = new TextDecoder();
  const output = `${decoder.decode(stdout)}${decoder.decode(stderr)}`;
  return { compiled: RAN_TESTS.test(output), ms: performance.now() - started, output, passed: success };
}

async function cover(dir: string, test: string, report: string): Promise<Covered> {
  const run = await runTests(dir, [test], BASELINE_TIMEOUT_MS, report);
  if (!run.passed) {
    throw new Error(`${test} fails before any mutation.\n${run.output}`);
  }
  const { stdout } = await new Deno.Command(Deno.execPath(), { args: ["coverage", "--lcov", report], cwd: dir })
    .output();
  const files = new Set<string>();
  for (const line of new TextDecoder().decode(stdout).split("\n")) {
    if (line.startsWith("SF:")) {
      files.add(line.slice(`SF:${dir}/`.length));
    }
  }
  return { files, ms: run.ms, test };
}

async function pool<Item, Output>(
  items: readonly Item[],
  dirs: readonly string[],
  work: (dir: string, item: Item) => Promise<Output>,
): Promise<Output[]> {
  const results: Output[] = [];
  const queue = items.map((item, index) => ({ index, item }));
  const drain = async (dir: string): Promise<void> => {
    const next = queue.shift();
    if (!next) {
      return;
    }
    results[next.index] = await work(dir, next.item);
    await drain(dir);
  };
  await Promise.all(dirs.map(async (dir): Promise<void> => {
    await drain(dir);
  }));
  return results;
}

function testsFor(file: string, covered: readonly Covered[]): readonly Covered[] {
  const loading = covered.filter(({ files }) => files.has(file));
  if (loading.length > NONE) {
    return loading;
  }
  return covered;
}

function outcomeOf(run: TestRun): Outcome {
  if (run.passed) {
    return "survived";
  }
  if (run.compiled) {
    return "killed";
  }
  return "invalid";
}

async function runMutants(
  root: string,
  mutants: readonly Mutant[],
  tests: readonly string[],
  workers: number,
): Promise<Result[]> {
  const scratch = await Deno.realPath(await Deno.makeTempDir({ prefix: "xquik-mutation-" }));
  try {
    const slots = Math.max(MINIMUM_WORKERS, workers);
    const copies = await Promise.all(Array.from({ length: slots }, async (_slot, index) => {
      await copyTree(root, `${scratch}/${String(index)}`);
      await Deno.mkdir(`${scratch}/${String(index)}.tmp`);
      return `${scratch}/${String(index)}`;
    }));
    const covered = await pool(tests, copies, async (dir, test) => await cover(dir, test, `${dir}.coverage/${test}`));
    return await pool(mutants, copies, async (dir, mutant): Promise<Result> => {
      const chosen = testsFor(mutant.file, covered);
      const path = `${dir}/${mutant.file}`;
      const original = await Deno.readTextFile(path);
      const mutated = original.slice(TEXT_START, mutant.start) + mutant.replacement + original.slice(mutant.end);
      await Deno.writeTextFile(path, mutated);
      const timeoutMs = MINIMUM_TIMEOUT_MS + TIMEOUT_FACTOR * chosen.reduce((total, { ms }) => total + ms, NONE);
      const run = await runTests(dir, chosen.map(({ test }) => test), timeoutMs);
      await Deno.writeTextFile(path, original);
      return { mutant, outcome: outcomeOf(run) };
    });
  } finally {
    await Deno.remove(scratch, { recursive: true });
  }
}

function score(results: readonly Result[]): number {
  const killed = results.filter(({ outcome }) => outcome === "killed").length;
  const survived = results.filter(({ outcome }) => outcome === "survived").length;
  if (killed + survived === NONE) {
    return FULL_SCORE;
  }
  return Math.round((killed / (killed + survived)) * HUNDREDTHS_PER_WHOLE) / HUNDREDTHS_PER_PERCENT;
}

function summary(results: readonly Result[]): string {
  const count = (outcome: Outcome): number => results.filter((result) => result.outcome === outcome).length;
  const survivors = results.filter(({ outcome }) => outcome === "survived").map(({ mutant }) =>
    `${mutant.file}:${String(mutant.line)} replaces ${JSON.stringify(mutant.original)} with ${
      JSON.stringify(mutant.replacement)
    }, and every test still passes.`
  );
  const rate = score(results).toFixed(SCORE_DECIMALS);
  return [
    ...survivors,
    `Mutation score is ${rate}%. The tests killed ${String(count("killed"))} of ${
      String(count("killed") + count("survived"))
    } mutants that compiled. ${String(count("invalid"))} of ${String(results.length)} mutants did not compile.`,
  ].join("\n");
}

export { runMutants, score, summary };
export type { Outcome, Result };
