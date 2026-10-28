import { assertEquals, assertStringIncludes } from "@std/assert";
import { z } from "zod";
import { FOREIGN_TABLES_SUFFIX, foreignTables, renderForeignTables } from "../scripts/foreign_tables.ts";
import { latestMigration, resolve, SPEC_PATH } from "../scripts/generate.ts";

const root: unknown = JSON.parse(await Deno.readTextFile(SPEC_PATH));
const migration = await Deno.readTextFile(latestMigration(FOREIGN_TABLES_SUFFIX));

const security = z.array(z.record(z.string(), z.unknown()));
const spec = z.object({
  security,
  paths: z.record(
    z.string(),
    z.object({
      parameters: z.array(z.unknown()).default([]),
      get: z.object({
        operationId: z.string(),
        security: security.optional(),
        parameters: z.array(z.unknown()).default([]),
        responses: z.record(z.string(), z.unknown()),
      }).optional(),
    }),
  ),
}).parse(root);
const parameter = z.object({ name: z.string(), in: z.string(), schema: z.unknown() });
const enumSchema = z.object({ enum: z.array(z.unknown()).default([]) });
const okResponse = z.object({ content: z.record(z.string(), z.unknown()).default({}) });

const snakeCase = (id: string) => id.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const publicReads = Object.entries(spec.paths).flatMap(([path, item]) => {
  const op = item.get;
  if (op === undefined) return [];
  const requirements = op.security ?? spec.security;
  if (!requirements.some((r) => Object.keys(r).length === 0 || "apiKey" in r)) return [];
  const parameters = [...item.parameters, ...op.parameters].map((value) => parameter.parse(resolve(root, value)));
  const pinned = parameters.find((p) =>
    p.in === "query" && p.name === "format" && enumSchema.parse(resolve(root, p.schema)).enum.includes("json")
  );
  const json = "application/json" in okResponse.parse(resolve(root, op.responses["200"] ?? {})).content;
  return [{ id: op.operationId, path, parameters, pinned, readable: json || pinned !== undefined }];
});

const migrationTables = new Map(
  [...migration.matchAll(
    /^create foreign table xquik\.(\w+) \(\n((?: {2}.+\n)+)\)\n {2}server xquik_server\n {2}options \((.+)\);$/gm,
  )]
    .map(([, name = "", columns = "", options = ""]) =>
      [name, {
        columns: columns.trimEnd().split(",\n").map((line) => line.trim()),
        options: Object.fromEntries(
          [...options.matchAll(/(\w+) '((?:[^']|'')*)'/g)].map(([, key = "", value = ""]) =>
            [key, value.replaceAll("''", "'")] as const
          ),
        ),
      }] as const
    ),
);

Deno.test("every public read with a JSON answer has a foreign table, & only streams & files have none", () => {
  const unreadable = publicReads.filter((read) => !read.readable).map((read) => read.id).sort();
  const readable = publicReads.filter((read) => read.readable).map((read) => snakeCase(read.id)).sort();
  console.log(
    `${migrationTables.size} foreign tables for ${publicReads.length} public reads. ` +
      `${unreadable.length} answer with no JSON.`,
  );
  assertEquals(unreadable, ["downloadSupportAttachment", "streamEvents"]);
  assertEquals([...migrationTables.keys()].sort(), readable);
});

Deno.test("each foreign table takes every path & query parameter as a quoted column & calls the spec path", () => {
  for (const read of publicReads.filter((read) => read.readable)) {
    const parameters = [
      ...read.parameters.filter((p) => p.in === "path"),
      ...read.parameters.filter((p) => p.in === "query" && p !== read.pinned),
    ];
    const table = migrationTables.get(snakeCase(read.id));
    assertEquals(
      table?.columns.map((column) => column.split(" ")[0]),
      [...parameters.map((p) => `"${p.name}"`), "attrs"],
      read.id,
    );
    assertEquals(table?.columns.at(-1), "attrs jsonb", read.id);
    assertEquals(table?.options["endpoint"], read.pinned ? `${read.path}?format=json` : read.path, read.id);
  }
});

Deno.test("the latest foreign table migration matches a fresh generation from openapi.json", () => {
  assertEquals(migration, renderForeignTables(foreignTables(root)));
});

Deno.test("list reads unwrap their list & page by their cursor, single reads keep the whole answer", () => {
  assertEquals(migrationTables.get("search_tweets")?.options, {
    endpoint: "/api/v1/x/tweets/search",
    response_path: "/tweets",
    cursor_param: "cursor",
    cursor_path: "/next_cursor",
  });
  assertEquals(migrationTables.get("list_draws")?.options, {
    endpoint: "/api/v1/draws",
    response_path: "/draws",
    cursor_param: "cursor",
    cursor_path: "/nextCursor",
  });
  assertEquals(migrationTables.get("list_drafts")?.options["cursor_param"], "afterCursor");
  assertEquals(migrationTables.get("list_drafts")?.options["cursor_path"], "/nextCursor");
  assertEquals(migrationTables.get("get_user")?.options, { endpoint: "/api/v1/x/users/{id}", response_path: "" });
  assertEquals(migrationTables.get("export_draw"), {
    columns: ['"id" text', '"type" text', "attrs jsonb"],
    options: { endpoint: "/api/v1/draws/{id}/export?format=json", response_path: "" },
  });
});

const jsonAnswer = (schema: unknown) => ({ "200": { content: { "application/json": { schema } } } });
const page = {
  type: "object",
  required: ["items"],
  properties: { items: { type: "array" }, next_cursor: { type: "string" } },
};

Deno.test("columns follow the path item's parameters, resolve references & take the first non-null type", () => {
  const tables = foreignTables({
    security: [{ apiKey: [] }],
    components: {
      parameters: { Id: { name: "id", in: "path", schema: { type: "string" } } },
      schemas: { Count: { type: "integer" } },
    },
    paths: {
      "/things/{id}": {
        parameters: [{ $ref: "#/components/parameters/Id" }],
        get: {
          operationId: "getThingStats",
          parameters: [
            { name: "ratio", in: "query", schema: { type: ["null", "number"] } },
            { name: "count", in: "query", schema: { $ref: "#/components/schemas/Count" } },
            { name: "flag", in: "query", schema: { type: "boolean" } },
            { name: "since", in: "query", schema: { type: "string" } },
            { name: "kind", in: "query", schema: { anyOf: [{ type: "string" }] } },
            { name: "nothing", in: "query", schema: { type: ["null"] } },
            { name: "x-trace", in: "header", schema: { type: "string" } },
          ],
          responses: jsonAnswer({ type: "object", properties: { name: { type: "string" } } }),
        },
      },
    },
  });
  assertEquals(tables, [{
    operationId: "getThingStats",
    table: "get_thing_stats",
    endpoint: "/things/{id}",
    columns: [
      { name: "id", type: "text" },
      { name: "ratio", type: "double precision" },
      { name: "count", type: "bigint" },
      { name: "flag", type: "boolean" },
      { name: "since", type: "text" },
      { name: "kind", type: "text" },
      { name: "nothing", type: "text" },
    ],
    responsePath: "",
    cursor: null,
  }]);
});

Deno.test("a read gets a table only when it is public & answers with JSON or a json format", () => {
  const format = (values: string[]) => ({ name: "format", in: "query", schema: { type: "string", enum: values } });
  const file = { "200": { content: { "application/octet-stream": { schema: { type: "string" } } } } };
  const tables = foreignTables({
    security: [{ oauthBearer: [] }],
    paths: {
      "/stream": { get: { operationId: "stream", security: [{ apiKey: [] }], responses: file } },
      "/empty": { get: { operationId: "empty", security: [{}], responses: { "204": {} } } },
      "/private": { get: { operationId: "private", responses: jsonAnswer(page) } },
      "/writes": { post: { operationId: "write", security: [{}], responses: jsonAnswer(page) } },
      "/csv": { get: { operationId: "csv", security: [{}], parameters: [format(["csv"])], responses: file } },
      "/exports/{id}": {
        get: {
          operationId: "export",
          security: [{}],
          parameters: [format(["csv", "json"]), { name: "id", in: "path", schema: { type: "string" } }],
          responses: file,
        },
      },
    },
  });
  assertEquals(tables, [{
    operationId: "export",
    table: "export",
    endpoint: "/exports/{id}?format=json",
    columns: [{ name: "id", type: "text" }],
    responsePath: "",
    cursor: null,
  }]);
});

Deno.test("a list read pages only when it takes a cursor & any answer shape carries the next one", () => {
  const cursor = { name: "cursor", in: "query", schema: { type: "string" } };
  const afterCursor = { name: "afterCursor", in: "query", schema: { type: "string" } };
  const camelPage = { ...page, properties: { items: { type: "array" }, nextCursor: { type: "string" } } };
  const read = (operationId: string, parameters: unknown[], schema: unknown) => ({
    get: { operationId, parameters, responses: jsonAnswer(schema) },
  });
  const tables = foreignTables({
    security: [{}],
    components: { schemas: { Page: page } },
    paths: {
      "/b": read("pagedThroughOneOf", [cursor], {
        oneOf: [{ $ref: "#/components/schemas/Page" }, { allOf: [{ $ref: "#/components/schemas/Page" }] }],
      }),
      "/a": read("pagedThroughAnyOf", [cursor], { anyOf: [{ type: "object" }, page] }),
      "/c": read("noCursorParameter", [], page),
      "/d": read("noCursorInAnswer", [cursor], { ...page, properties: { items: { type: "array" } } }),
      "/e": read("pagedAfterCamelCursor", [afterCursor], camelPage),
    },
  });
  const paged = { param: "cursor", path: "/next_cursor" };
  assertEquals(
    tables.map(({ operationId, responsePath, cursor }) => ({ operationId, responsePath, cursor })),
    [
      { operationId: "noCursorInAnswer", responsePath: "/items", cursor: null },
      { operationId: "noCursorParameter", responsePath: "/items", cursor: null },
      {
        operationId: "pagedAfterCamelCursor",
        responsePath: "/items",
        cursor: { param: "afterCursor", path: "/nextCursor" },
      },
      { operationId: "pagedThroughAnyOf", responsePath: "", cursor: paged },
      { operationId: "pagedThroughOneOf", responsePath: "/items", cursor: paged },
    ],
  );
});

Deno.test("rendered tables quote column names, escape literals & leave out an absent cursor_path", () => {
  const sql = renderForeignTables([{
    operationId: "getQuote",
    table: "get_quote",
    endpoint: "/quotes/{id}?tag='a'",
    columns: [{ name: 'page"Size', type: "bigint" }],
    responsePath: "",
    cursor: null,
  }]);
  assertStringIncludes(
    sql,
    `create foreign table xquik.get_quote (
  "page""Size" bigint,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/quotes/{id}?tag=''a''', response_path '');
`,
  );
});
