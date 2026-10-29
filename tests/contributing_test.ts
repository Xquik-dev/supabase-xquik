import { assertEquals } from "@std/assert";

const STEP = /(?<=^run_check "[^"]*" ")[^"]+/gmu;
const ITEM = /^\d+\. \*\*[^*]+\*\*/gmu;
const FIRST = 1;

Deno.test("CONTRIBUTING.md numbers each check of bin/check-local in its order, under the name the run prints", async () => {
  const [script, guide] = await Promise.all([
    Deno.readTextFile("bin/check-local"),
    Deno.readTextFile("CONTRIBUTING.md"),
  ]);
  const steps = [...script.matchAll(STEP)].map(([name], index) => `${String(index + FIRST)}. **${name}.**`);
  assertEquals([...guide.matchAll(ITEM)].map(([item]) => item), steps);
});
