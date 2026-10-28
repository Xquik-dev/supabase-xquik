import {
  assertEquals,
  assertExists,
  assertMatch,
  assertNotEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { FOREIGN_TABLES_SUFFIX, renderForeignTables } from "@/scripts/foreign_tables.ts";
import { latestMigration, readGeneration, REGISTRY_SUFFIX, renderMigration, SPEC_PATH } from "@/scripts/generate.ts";
import parseJson from "@shared/json.ts";
import { publicOperations } from "@/scripts/openapi.ts";
import readDir from "@/scripts/read_dir.ts";
import { z } from "zod";

const FAILED = 1;
const MIGRATIONS = "supabase/migrations";

const change = { changed: z.boolean(), file: z.string() };
const summary = z.tuple([
  z.object({ operations: z.number(), ...change }).strict(),
  z.object({ foreignTables: z.number(), ...change }).strict(),
]);

const { rows, tables } = await readGeneration();

async function scratchTree(): Promise<string> {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/${MIGRATIONS}`, { recursive: true });
  await Deno.copyFile(SPEC_PATH, `${dir}/${SPEC_PATH}`);
  return dir;
}

async function runGenerate(cwd: string, allowRead: string): Promise<Deno.CommandOutput> {
  return await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--config",
      new URL("../deno.json", import.meta.url).pathname,
      `--allow-read=${allowRead}`,
      `--allow-write=${MIGRATIONS}`,
      new URL("../scripts/generate.ts", import.meta.url).pathname,
    ],
    cwd,
  }).output();
}

async function generateIn(dir: string): Promise<z.infer<typeof summary>> {
  const output = await runGenerate(dir, `${SPEC_PATH},${MIGRATIONS}`);
  const lines = new TextDecoder().decode(output.stdout).trimEnd().split("\n");
  return summary.parse(lines.map((line): unknown => parseJson(line)));
}

Deno.test("the latest registry & foreign table migrations match a fresh generation from openapi.json", async () => {
  const fresh = { [REGISTRY_SUFFIX]: renderMigration(rows), [FOREIGN_TABLES_SUFFIX]: renderForeignTables(tables) };
  await Promise.all(
    Object.entries(fresh).map(async ([suffix, sql]) => {
      const latest = latestMigration(suffix);
      assertExists(latest, `no *${suffix} migration`);
      assertEquals(await Deno.readTextFile(latest), sql, suffix);
    }),
  );
});

Deno.test("list_field names the required array that every success shape shares", () => {
  const listFields = Object.fromEntries(rows.map((row) => [row.operationId, row.listField]));
  assertEquals(
    {
      compose: listFields["compose"],
      getAccount: listFields["getAccount"],
      getTweetReplies: listFields["getTweetReplies"],
      getUser: listFields["getUser"],
      getUserFollowers: listFields["getUserFollowers"],
      searchTweets: listFields["searchTweets"],
    },
    {
      compose: null,
      getAccount: null,
      getTweetReplies: "tweets",
      getUser: null,
      getUserFollowers: "users",
      searchTweets: "tweets",
    },
  );
});

Deno.test("publicOperations names a broken reference in openapi.json", () => {
  const spec = {
    info: { title: "Xquik" },
    paths: { "/x": { get: { operationId: "getX", responses: { "200": { $ref: "#/info/title/deeper" } } } } },
    security: [{ apiKey: [] }],
  };
  assertThrows(() => publicOperations(spec), Error, "openapi.json has a broken reference #/info/title/deeper");
});

Deno.test("deno task generate writes each migration once under its own stamp & reuses both while openapi.json stays the same", async () => {
  const dir = await scratchTree();
  const [registry, foreign] = await generateIn(dir);
  assertEquals([registry.operations, registry.changed, foreign.foreignTables, foreign.changed], [
    rows.length,
    true,
    tables.length,
    true,
  ]);
  assertMatch(registry.file, /^supabase\/migrations\/\d{14}_xquik_operations\.sql$/v);
  assertMatch(foreign.file, /^supabase\/migrations\/\d{14}_xquik_foreign_tables\.sql$/v);
  assertNotEquals(
    /\d{14}/v.exec(registry.file)?.[0],
    /\d{14}/v.exec(foreign.file)?.[0],
    "Supabase keys each migration by its stamp, so 2 migrations in 1 run need 2 stamps",
  );
  assertEquals(await Deno.readTextFile(`${dir}/${registry.file}`), renderMigration(rows));
  assertEquals(await Deno.readTextFile(`${dir}/${foreign.file}`), renderForeignTables(tables));
  assertEquals(await generateIn(dir), [{ ...registry, changed: false }, { ...foreign, changed: false }]);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("deno task generate stops when it cannot read the migrations, so it writes no duplicate", async () => {
  const root = await scratchTree();
  const latest = latestMigration(REGISTRY_SUFFIX);
  assertExists(latest);
  await Deno.copyFile(latest, `${root}/${latest}`);
  const output = await runGenerate(root, SPEC_PATH);
  assertEquals(output.code, FAILED);
  assertStringIncludes(new TextDecoder().decode(output.stderr), 'Requires read access to "supabase/migrations"');
  const names = await Array.fromAsync(readDir(`${root}/${MIGRATIONS}`), (entry) => `${MIGRATIONS}/${entry.name}`);
  assertEquals(names, [latest]);
});
