import { z } from "zod";
import { isPublic, listField, literal, resolve } from "./generate.ts";

export const FOREIGN_TABLES_SUFFIX = "_xquik_foreign_tables.sql";

type ColumnType = "text" | "bigint" | "double precision" | "boolean";

export type ForeignTable = {
  readonly operationId: string;
  readonly table: string;
  readonly endpoint: string;
  readonly columns: readonly { readonly name: string; readonly type: ColumnType }[];
  readonly responsePath: string;
  readonly cursorPath: string | null;
};

const COLUMN_TYPES = new Map<string, ColumnType>([
  ["boolean", "boolean"],
  ["integer", "bigint"],
  ["number", "double precision"],
]);

const securityRequirements = z.array(z.record(z.string(), z.array(z.string())));
const document = z.object({
  security: securityRequirements,
  paths: z.record(z.string(), z.object({ parameters: z.array(z.unknown()).default([]), get: z.unknown().optional() })),
});
const operation = z.object({
  operationId: z.string().min(1),
  security: securityRequirements.optional(),
  parameters: z.array(z.unknown()).default([]),
  responses: z.record(z.string(), z.unknown()),
});
const parameter = z.object({
  name: z.string().min(1),
  in: z.enum(["path", "query", "header", "cookie"]),
  schema: z.unknown(),
});
const schemaNode = z.object({
  type: z.union([z.string(), z.array(z.string())]).optional(),
  enum: z.array(z.unknown()).default([]),
  properties: z.record(z.string(), z.unknown()).default({}),
  allOf: z.array(z.unknown()).default([]),
  oneOf: z.array(z.unknown()).default([]),
  anyOf: z.array(z.unknown()).default([]),
});
const response = z.object({
  content: z.record(z.string(), z.object({ schema: z.unknown() })).default({}),
});

type Parameter = z.infer<typeof parameter>;

function columnType(root: unknown, schema: unknown): ColumnType {
  const { type } = schemaNode.parse(resolve(root, schema));
  const first = [type ?? []].flat().find((name) => name !== "null");
  return COLUMN_TYPES.get(first ?? "") ?? "text";
}

function mayHaveProperty(root: unknown, value: unknown, name: string): boolean {
  const node = schemaNode.parse(resolve(root, value));
  return name in node.properties ||
    [...node.allOf, ...node.oneOf, ...node.anyOf].some((member) => mayHaveProperty(root, member, name));
}

function foreignTable(
  root: unknown,
  path: string,
  op: z.infer<typeof operation>,
  parameters: readonly Parameter[],
): ForeignTable | null {
  const format = parameters.find((p) =>
    p.in === "query" && p.name === "format" && schemaNode.parse(resolve(root, p.schema)).enum.includes("json")
  );
  const json = response.parse(resolve(root, op.responses["200"] ?? {})).content["application/json"];
  if (format === undefined && json === undefined) return null;
  const columns = [
    ...parameters.filter((p) => p.in === "path"),
    ...parameters.filter((p) => p.in === "query" && p !== format),
  ];
  const takesCursor = parameters.some((p) => p.in === "query" && p.name === "cursor");
  const returnsCursor = json !== undefined && mayHaveProperty(root, json.schema, "next_cursor");
  const field = listField(root, op.responses);
  return {
    operationId: op.operationId,
    table: op.operationId.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    endpoint: format === undefined ? path : `${path}?format=json`,
    columns: columns.map((p) => ({ name: p.name, type: columnType(root, p.schema) })),
    responsePath: field === null ? "" : `/${field}`,
    cursorPath: takesCursor && returnsCursor ? "/next_cursor" : null,
  };
}

export function foreignTables(root: unknown): ForeignTable[] {
  const spec = document.parse(root);
  const tables = Object.entries(spec.paths).flatMap(([path, item]) => {
    if (item.get === undefined) return [];
    const op = operation.parse(item.get);
    if (!isPublic(op.security ?? spec.security)) return [];
    const parameters = [...item.parameters, ...op.parameters].map((value) => parameter.parse(resolve(root, value)));
    const table = foreignTable(root, path, op, parameters);
    return table === null ? [] : [table];
  });
  return tables.sort((a, b) => (a.operationId < b.operationId ? -1 : 1));
}

const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

function renderTable(table: ForeignTable): string {
  const columns = [...table.columns.map((column) => `${identifier(column.name)} ${column.type}`), "attrs jsonb"];
  const options = Object.entries({
    endpoint: table.endpoint,
    response_path: table.responsePath,
    ...(table.cursorPath === null ? {} : { cursor_path: table.cursorPath }),
  });
  return `create foreign table xquik.${table.table} (
${columns.map((column) => `  ${column}`).join(",\n")}
)
  server xquik_server
  options (${options.map(([name, value]) => `${name} ${literal(value)}`).join(", ")});
`;
}

export function renderForeignTables(tables: readonly ForeignTable[]): string {
  return `set local lock_timeout = '5s';
set local statement_timeout = '1min';

create extension if not exists wrappers with schema extensions;

drop foreign data wrapper if exists xquik_wrapper cascade;
create foreign data wrapper xquik_wrapper
  handler extensions.wasm_fdw_handler
  validator extensions.wasm_fdw_validator;

create server xquik_server
  foreign data wrapper xquik_wrapper
  options (
    fdw_package_url 'https://github.com/supabase/wrappers/releases/download/wasm_openapi_fdw_v0.2.1/openapi_fdw.wasm',
    fdw_package_name 'supabase:openapi-fdw',
    fdw_package_version '0.2.1',
    fdw_package_checksum '12c902f3089e18142a1d8d35c66b9ceb85c193224229687bd929aff6b44cddde',
    base_url 'https://xquik.com',
    api_key_id 'xquik_api_key',
    api_key_header 'x-api-key',
    cursor_param 'cursor',
    max_pages '10'
  );
${tables.map((table) => `\n${renderTable(table)}`).join("")}`;
}
