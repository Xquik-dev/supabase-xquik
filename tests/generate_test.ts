import { assertEquals, assertMatch, assertThrows } from "@std/assert";
import { z } from "zod";
import { latestMigration, operationRows, REGISTRY_SUFFIX, renderMigration, SPEC_PATH } from "../scripts/generate.ts";

const rows = operationRows(JSON.parse(await Deno.readTextFile(SPEC_PATH)));

Deno.test("the latest registry migration matches a fresh generation from openapi.json", async () => {
  assertEquals(await Deno.readTextFile(latestMigration(REGISTRY_SUFFIX)), renderMigration(rows));
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

Deno.test("deno task generate writes a migration once and reuses it while openapi.json stays the same", async () => {
  const root = await Deno.makeTempDir();
  await Deno.mkdir(`${root}/supabase/migrations`, { recursive: true });
  await Deno.copyFile(SPEC_PATH, `${root}/${SPEC_PATH}`);
  const summary = z.object({ operations: z.number(), file: z.string(), changed: z.boolean() });
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
      cwd: root,
    }).output();
    return summary.parse(JSON.parse(new TextDecoder().decode(output.stdout)));
  };
  const first = await generate();
  assertEquals([first.operations, first.changed], [rows.length, true]);
  assertMatch(first.file, /^supabase\/migrations\/\d{14}_xquik_operations\.sql$/);
  assertEquals(await Deno.readTextFile(`${root}/${first.file}`), renderMigration(rows));
  assertEquals(await generate(), { ...first, changed: false });
});
