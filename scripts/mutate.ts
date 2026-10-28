import { mutantsOf, runMutants, score, summary } from "./mutation.ts";

const [minimum, ...files] = Deno.args;
const mutants = (await Promise.all(files.map(async (file) => mutantsOf(file, await Deno.readTextFile(file))))).flat();
const tests = (await Array.fromAsync(Deno.readDir("tests"))).map(({ name }) => `tests/${name}`)
  .filter((name) => name.endsWith("_test.ts")).sort();
const results = await runMutants(Deno.cwd(), mutants, tests, Math.floor(navigator.hardwareConcurrency / 2));
console.log(summary(results));
if (!(score(results) >= Number(minimum))) Deno.exitCode = 1;
