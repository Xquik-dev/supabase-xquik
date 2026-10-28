import { equivalents, plan, runMutants, score, summary } from "./mutation.ts";

const [minimum, equivalentsFile, ...files] = Deno.args;
const sources = new Map(await Promise.all(files.map(async (file) => [file, await Deno.readTextFile(file)] as const)));
const entries = equivalents.parse(JSON.parse(await Deno.readTextFile(String(equivalentsFile))));
const { mutants, equivalent, stale } = plan(sources, entries);
if (stale.length > 0) {
  console.log(stale.join("\n"));
  Deno.exit(1);
}
const tests = Deno.readDirSync("tests").map(({ name }) => `tests/${name}`).filter((name) => name.endsWith("_test.ts"))
  .toArray().toSorted();
const results = await runMutants(Deno.cwd(), mutants, tests, Math.floor(navigator.hardwareConcurrency / 2));
console.log(summary(results, equivalent));
if (!(score(results) >= Number(minimum))) Deno.exitCode = 1;
