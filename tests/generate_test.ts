import {
  assertEquals,
  assertExists,
  assertMatch,
  assertNotEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { z } from "zod";
import { FOREIGN_TABLES_SUFFIX, renderForeignTables } from "../scripts/foreign_tables.ts";
import { latestMigration, readGeneration, REGISTRY_SUFFIX, renderMigration, SPEC_PATH } from "../scripts/generate.ts";
import { publicOperations } from "../scripts/openapi.ts";

const { rows, tables } = await readGeneration();

Deno.test("the latest registry & foreign table migrations match a fresh generation from openapi.json", async () => {
  const fresh = { [REGISTRY_SUFFIX]: renderMigration(rows), [FOREIGN_TABLES_SUFFIX]: renderForeignTables(tables) };
  for (const [suffix, sql] of Object.entries(fresh)) {
    const latest = latestMigration(suffix);
    assertExists(latest, `no *${suffix} migration`);
    assertEquals(await Deno.readTextFile(latest), sql, suffix);
  }
});

Deno.test("list_field names the required array that every success shape shares", () => {
  const listFields = Object.fromEntries(rows.map((row) => [row.operationId, row.listField]));
  assertEquals(
    {
      searchTweets: listFields["searchTweets"],
      getUserFollowers: listFields["getUserFollowers"],
      getTweetReplies: listFields["getTweetReplies"],
      compose: listFields["compose"],
      getAccount: listFields["getAccount"],
      getUser: listFields["getUser"],
    },
    {
      searchTweets: "tweets",
      getUserFollowers: "users",
      getTweetReplies: "tweets",
      compose: null,
      getAccount: null,
      getUser: null,
    },
  );
});

Deno.test("publicOperations names a broken reference in openapi.json", () => {
  const spec = {
    security: [{ apiKey: [] }],
    info: { title: "Xquik" },
    paths: { "/x": { get: { operationId: "getX", responses: { "200": { $ref: "#/info/title/deeper" } } } } },
  };
  assertThrows(() => publicOperations(spec), Error, "openapi.json has a broken reference #/info/title/deeper");
});

Deno.test("deno task generate writes each migration once under its own stamp & reuses both while openapi.json stays the same", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/supabase/migrations`, { recursive: true });
  await Deno.copyFile(SPEC_PATH, `${dir}/${SPEC_PATH}`);
  const change = { file: z.string(), changed: z.boolean() };
  const summary = z.tuple([
    z.object({ operations: z.number(), ...change }).strict(),
    z.object({ foreignTables: z.number(), ...change }).strict(),
  ]);
  const generate = async (): Promise<z.infer<typeof summary>> => {
    const output = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--config",
        new URL("../deno.json", import.meta.url).pathname,
        "--allow-read=openapi.json,supabase/migrations",
        "--allow-write=supabase/migrations",
        new URL("../scripts/generate.ts", import.meta.url).pathname,
      ],
      cwd: dir,
    }).output();
    const lines = new TextDecoder().decode(output.stdout).trimEnd().split("\n");
    return summary.parse(lines.map((line): unknown => JSON.parse(line)));
  };
  const first = await generate();
  const [registry, foreign] = first;
  assertEquals([registry.operations, registry.changed, foreign.foreignTables, foreign.changed], [
    rows.length,
    true,
    tables.length,
    true,
  ]);
  assertMatch(registry.file, /^supabase\/migrations\/\d{14}_xquik_operations\.sql$/);
  assertMatch(foreign.file, /^supabase\/migrations\/\d{14}_xquik_foreign_tables\.sql$/);
  assertNotEquals(
    registry.file.match(/\d{14}/)?.[0],
    foreign.file.match(/\d{14}/)?.[0],
    "Supabase keys each migration by its stamp, so 2 migrations in 1 run need 2 stamps",
  );
  assertEquals(await Deno.readTextFile(`${dir}/${registry.file}`), renderMigration(rows));
  assertEquals(await Deno.readTextFile(`${dir}/${foreign.file}`), renderForeignTables(tables));
  assertEquals(await generate(), [{ ...registry, changed: false }, { ...foreign, changed: false }]);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("deno task generate stops when it cannot read the migrations, so it writes no duplicate", () => {
  const root = Deno.makeTempDirSync();
  const latest = latestMigration(REGISTRY_SUFFIX);
  assertExists(latest);
  Deno.mkdirSync(`${root}/supabase/migrations`, { recursive: true });
  Deno.copyFileSync(SPEC_PATH, `${root}/${SPEC_PATH}`);
  Deno.copyFileSync(latest, `${root}/${latest}`);
  const output = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--config",
      new URL("../deno.json", import.meta.url).pathname,
      "--allow-read=openapi.json",
      "--allow-write=supabase/migrations",
      new URL("../scripts/generate.ts", import.meta.url).pathname,
    ],
    cwd: root,
  }).outputSync();
  assertEquals(output.code, 1);
  assertStringIncludes(new TextDecoder().decode(output.stderr), 'Requires read access to "supabase/migrations"');
  const names = Deno.readDirSync(`${root}/supabase/migrations`).map((entry) => `supabase/migrations/${entry.name}`);
  assertEquals(names.toArray(), [latest]);
});
