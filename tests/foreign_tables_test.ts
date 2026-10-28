import { assertEquals } from "@std/assert";
import { foreignTables } from "../scripts/foreign_tables.ts";
import { publicOperations } from "../scripts/openapi.ts";

const jsonAnswer = (schema: unknown) => ({ "200": { content: { "application/json": { schema } } } });
const page = {
  type: "object",
  required: ["items"],
  properties: { items: { type: "array" }, next_cursor: { type: "string" } },
};

Deno.test("columns follow the path item's parameters, resolve references & take the first non-null type", () => {
  const tables = foreignTables(publicOperations({
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
  }));
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
  const tables = foreignTables(publicOperations({
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
  }));
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
  const tables = foreignTables(publicOperations({
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
  }));
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
