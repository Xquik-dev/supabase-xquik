import { assertEquals } from "@std/assert";
import { foreignTables } from "@/scripts/foreign_tables.ts";
import { publicOperations } from "@/scripts/openapi.ts";

const jsonAnswer = (schema: unknown): unknown => ({ "200": { content: { "application/json": { schema } } } });
const page = {
  properties: { items: { type: "array" }, next_cursor: { type: "string" } },
  required: ["items"],
  type: "object",
};

const format = (values: string[]): unknown => ({
  in: "query",
  name: "format",
  schema: { enum: values, type: "string" },
});

const read = (operationId: string, parameters: unknown[], schema: unknown): unknown => ({
  get: { operationId, parameters, responses: jsonAnswer(schema) },
});

Deno.test("columns follow the path item's parameters, resolve references & take the first non-null type", () => {
  const tables = foreignTables(publicOperations({
    components: {
      parameters: { Id: { in: "path", name: "id", schema: { type: "string" } } },
      schemas: { Count: { type: "integer" } },
    },
    paths: {
      "/things/{id}": {
        get: {
          operationId: "getThingStats",
          parameters: [
            { in: "query", name: "ratio", schema: { type: ["null", "number"] } },
            { in: "query", name: "count", schema: { $ref: "#/components/schemas/Count" } },
            { in: "query", name: "flag", schema: { type: "boolean" } },
            { in: "query", name: "since", schema: { type: "string" } },
            { in: "query", name: "kind", schema: { anyOf: [{ type: "string" }] } },
            { in: "query", name: "nothing", schema: { type: ["null"] } },
            { in: "header", name: "x-trace", schema: { type: "string" } },
          ],
          responses: jsonAnswer({ properties: { name: { type: "string" } }, type: "object" }),
        },
        parameters: [{ $ref: "#/components/parameters/Id" }],
      },
    },
    security: [{ apiKey: [] }],
  }));
  assertEquals(tables, [{
    columns: [
      { name: "id", type: "text" },
      { name: "ratio", type: "double precision" },
      { name: "count", type: "bigint" },
      { name: "flag", type: "boolean" },
      { name: "since", type: "text" },
      { name: "kind", type: "text" },
      { name: "nothing", type: "text" },
    ],
    cursor: null,
    endpoint: "/things/{id}",
    operationId: "getThingStats",
    responsePath: "",
    table: "get_thing_stats",
  }]);
});

Deno.test("a read gets a table only when it is public & answers with JSON or a json format", () => {
  const file = { "200": { content: { "application/octet-stream": { schema: { type: "string" } } } } };
  const tables = foreignTables(publicOperations({
    paths: {
      "/csv": { get: { operationId: "csv", parameters: [format(["csv"])], responses: file, security: [{}] } },
      "/empty": { get: { operationId: "empty", responses: { "204": {} }, security: [{}] } },
      "/exports/{id}": {
        get: {
          operationId: "export",
          parameters: [format(["csv", "json"]), { in: "path", name: "id", schema: { type: "string" } }],
          responses: file,
          security: [{}],
        },
      },
      "/private": { get: { operationId: "private", responses: jsonAnswer(page) } },
      "/stream": { get: { operationId: "stream", responses: file, security: [{ apiKey: [] }] } },
      "/writes": { post: { operationId: "write", responses: jsonAnswer(page), security: [{}] } },
    },
    security: [{ oauthBearer: [] }],
  }));
  assertEquals(tables, [{
    columns: [{ name: "id", type: "text" }],
    cursor: null,
    endpoint: "/exports/{id}?format=json",
    operationId: "export",
    responsePath: "",
    table: "export",
  }]);
});

Deno.test("a list read pages only when it takes a cursor & any answer shape carries the next one", () => {
  const cursorParameter = { in: "query", name: "cursor", schema: { type: "string" } };
  const afterCursor = { in: "query", name: "afterCursor", schema: { type: "string" } };
  const camelPage = { ...page, properties: { items: { type: "array" }, nextCursor: { type: "string" } } };
  const tables = foreignTables(publicOperations({
    components: { schemas: { Page: page } },
    paths: {
      "/a": read("pagedThroughAnyOf", [cursorParameter], { anyOf: [{ type: "object" }, page] }),
      "/b": read("pagedThroughOneOf", [cursorParameter], {
        oneOf: [{ $ref: "#/components/schemas/Page" }, { allOf: [{ $ref: "#/components/schemas/Page" }] }],
      }),
      "/c": read("noCursorParameter", [], page),
      "/d": read("noCursorInAnswer", [cursorParameter], { ...page, properties: { items: { type: "array" } } }),
      "/e": read("pagedAfterCamelCursor", [afterCursor], camelPage),
    },
    security: [{}],
  }));
  const paged = { param: "cursor", path: "/next_cursor" };
  assertEquals(
    tables.map(({ operationId, responsePath, cursor }) => ({ cursor, operationId, responsePath })),
    [
      { cursor: null, operationId: "noCursorInAnswer", responsePath: "/items" },
      { cursor: null, operationId: "noCursorParameter", responsePath: "/items" },
      {
        cursor: { param: "afterCursor", path: "/nextCursor" },
        operationId: "pagedAfterCamelCursor",
        responsePath: "/items",
      },
      { cursor: paged, operationId: "pagedThroughAnyOf", responsePath: "" },
      { cursor: paged, operationId: "pagedThroughOneOf", responsePath: "/items" },
    ],
  );
});
