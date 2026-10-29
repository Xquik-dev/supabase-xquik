import { assertEquals, assertExists, assertLess, assertMatch, assertStringIncludes, assertThrows } from "@std/assert";
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

function referring(info: unknown, $ref: string): unknown {
  return {
    info,
    paths: { "/x": { get: { operationId: "getX", responses: { "200": { $ref } } } } },
    security: [{ apiKey: [] }],
  };
}

Deno.test("publicOperations names a broken reference in openapi.json, also one that passes through null", () => {
  for (const [info, $ref] of [[{ title: "Xquik" }, "#/info/title/deeper"], [null, "#/info/deeper"]] as const) {
    assertThrows(() => publicOperations(referring(info, $ref)), Error, `openapi.json has a broken reference ${$ref}`);
  }
});

Deno.test("publicOperations decodes escaped references, keeps outside ones as they are and sorts equal ids stably", () => {
  const session = { in: "cookie", name: "session", schema: { $ref: "https://example.com/session.json" } };
  const spec = {
    components: { parameters: { "a~b/c": session } },
    paths: Object.fromEntries([
      ["/b", {
        get: { operationId: "same", parameters: [{ $ref: "#/components/parameters/a~0b~1c" }], responses: {} },
      }],
      ["/a", { get: { operationId: "same", responses: {} } }],
    ]),
    security: [{ apiKey: [] }],
  };
  assertEquals(publicOperations(spec).map(({ path, parameters }) => ({ parameters, path })), [
    { parameters: [{ enum: [], in: "cookie", name: "session", type: null }], path: "/b" },
    { parameters: [], path: "/a" },
  ]);
});

Deno.test("deno task generate writes each migration once under its own stamp", async () => {
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
  assertLess(
    registry.file.replace(REGISTRY_SUFFIX, ""),
    foreign.file.replace(FOREIGN_TABLES_SUFFIX, ""),
    "Supabase applies migrations in stamp order, so the registry needs an earlier stamp than the foreign tables",
  );
  assertEquals(await Deno.readTextFile(`${dir}/${registry.file}`), renderMigration(rows));
  assertEquals(await Deno.readTextFile(`${dir}/${foreign.file}`), renderForeignTables(tables));
  await Deno.remove(dir, { recursive: true });
});

Deno.test("deno task generate reuses both migrations and leaves their files untouched while openapi.json stays the same", async () => {
  const dir = await scratchTree();
  const first = await generateIn(dir);
  const written = new Date("2026-01-01T00:00:00.000Z");
  await Promise.all(first.map(async ({ file }): Promise<void> => {
    await Deno.utime(`${dir}/${file}`, written, written);
  }));
  const [registry, foreign] = first;
  assertEquals(await generateIn(dir), [{ ...registry, changed: false }, { ...foreign, changed: false }]);
  const stats = await Promise.all(first.map(async ({ file }) => await Deno.stat(`${dir}/${file}`)));
  assertEquals(stats.map(({ mtime }) => mtime?.toISOString()), [
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
  ]);
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
