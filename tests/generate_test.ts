import { assertEquals, assertMatch, assertNotEquals, assertThrows } from "@std/assert";
import { z } from "zod";
import { foreignTables, renderForeignTables } from "../scripts/foreign_tables.ts";
import { latestMigration, operationRows, REGISTRY_SUFFIX, renderMigration, SPEC_PATH } from "../scripts/generate.ts";

const root: unknown = JSON.parse(await Deno.readTextFile(SPEC_PATH));
const rows = operationRows(root);

Deno.test("the latest registry migration matches a fresh generation from openapi.json", async () => {
  assertEquals(await Deno.readTextFile(latestMigration(REGISTRY_SUFFIX)), renderMigration(rows));
});

Deno.test("latestMigration names the suffix it found no migration for", () => {
  assertThrows(
    () => latestMigration("_missing.sql"),
    Deno.errors.NotFound,
    "No *_missing.sql migration in supabase/migrations",
  );
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

Deno.test("operationRows names a broken reference in openapi.json", () => {
  const spec = {
    security: [{ apiKey: [] }],
    info: { title: "Xquik" },
    paths: { "/x": { get: { operationId: "getX", responses: { "200": { $ref: "#/info/title/deeper" } } } } },
  };
  assertThrows(() => operationRows(spec), Error, "openapi.json has a broken reference #/info/title/deeper");
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
  const tables = foreignTables(root);
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
