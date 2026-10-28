import { runMutants, score, summary } from "./mutation.ts";
import mutantsOf from "./mutants.ts";

const CORES_PER_WORKER = 2;

const [minimum, ...files] = Deno.args;
const perFile = await Promise.all(files.map(async (file) => mutantsOf(file, await Deno.readTextFile(file))));
const testFiles = [...Deno.readDirSync("tests")].map(({ name }) => `tests/${name}`);
const tests = testFiles.filter((name) => name.endsWith("_test.ts")).toSorted();
const workers = Math.floor(navigator.hardwareConcurrency / CORES_PER_WORKER);
const results = await runMutants(Deno.cwd(), perFile.flat(), tests, workers);
await Deno.stdout.write(new TextEncoder().encode(`${summary(results)}\n`));
if (!(score(results) >= Number(minimum))) {
  Deno.exitCode = 1;
}
