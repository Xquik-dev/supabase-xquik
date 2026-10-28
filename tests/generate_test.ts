import { assertEquals } from "@std/assert";
import { latestMigration, operationRows, REGISTRY_SUFFIX, renderMigration, SPEC_PATH } from "../scripts/generate.ts";

const rows = operationRows(JSON.parse(await Deno.readTextFile(SPEC_PATH)));

Deno.test("the latest registry migration matches a fresh generation from openapi.json", async () => {
  assertEquals(await Deno.readTextFile(await latestMigration(REGISTRY_SUFFIX)), renderMigration(rows));
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
