import { equivalents, plan } from "./mutants.ts";
import { runMutants, score, summary } from "./mutation.ts";
import parseJson from "@shared/json.ts";

const CORES_PER_WORKER = 2;
const NONE = 0;
const EXIT_FAILURE = 1;
const encoder = new TextEncoder();

const [minimum, equivalentsFile, ...files] = Deno.args;
const texts = await Promise.all(files.map(async (file) => [file, await Deno.readTextFile(file)] as const));
const listed = await Deno.readTextFile(String(equivalentsFile));
const entries = equivalents.parse(parseJson(listed));
const { equivalent, mutants, stale } = plan(new Map(texts), entries);
if (stale.length > NONE) {
  await Deno.stdout.write(encoder.encode(`${stale.join("\n")}\n`));
  Deno.exit(EXIT_FAILURE);
}
const testFiles = [...Deno.readDirSync("tests")].map(({ name }) => `tests/${name}`);
const tests = testFiles.filter((name) => name.endsWith("_test.ts")).toSorted();
const workers = Math.floor(navigator.hardwareConcurrency / CORES_PER_WORKER);
const results = await runMutants(Deno.cwd(), mutants, tests, workers);
await Deno.stdout.write(encoder.encode(`${summary(results, equivalent)}\n`));
if (!(score(results) >= Number(minimum))) {
  Deno.exitCode = EXIT_FAILURE;
}
