import { type Operation, publicOperations, schemaAt } from "./openapi.ts";
import { identifier, literal } from "./sql.ts";

export const FOREIGN_TABLES_SUFFIX = "_xquik_foreign_tables.sql";

type ColumnType = "text" | "bigint" | "double precision" | "boolean";

export type ForeignTable = {
  readonly operationId: string;
  readonly table: string;
  readonly endpoint: string;
  readonly columns: readonly { readonly name: string; readonly type: ColumnType }[];
  readonly responsePath: string;
  readonly cursor: { readonly param: string; readonly path: string } | null;
};

const CURSOR_PARAMS = ["cursor", "afterCursor"];
const CURSOR_FIELDS = ["next_cursor", "nextCursor"];

const COLUMN_TYPES = new Map<string, ColumnType>([
  ["boolean", "boolean"],
  ["integer", "bigint"],
  ["number", "double precision"],
]);

function columnType(root: unknown, schema: unknown): ColumnType {
  const first = [schemaAt(root, schema).type ?? []].flat().find((name) => name !== "null");
  return COLUMN_TYPES.get(first ?? "") ?? "text";
}

function mayHaveProperty(root: unknown, value: unknown, name: string): boolean {
  const node = schemaAt(root, value);
  return name in node.properties ||
    [...node.allOf, ...node.oneOf, ...node.anyOf].some((member) => mayHaveProperty(root, member, name));
}

function foreignTable(root: unknown, { operationId, path, parameters, json, listField }: Operation): ForeignTable[] {
  const format = parameters.find((p) =>
    p.in === "query" && p.name === "format" && schemaAt(root, p.schema).enum.includes("json")
  );
  if (format === undefined && json === undefined) return [];
  const columns = [
    ...parameters.filter((p) => p.in === "path"),
    ...parameters.filter((p) => p.in === "query" && p !== format),
  ];
  const cursorParam = CURSOR_PARAMS.find((name) => parameters.some((p) => p.in === "query" && p.name === name));
  const cursorField = CURSOR_FIELDS.find((name) => json !== undefined && mayHaveProperty(root, json.schema, name));
  return [{
    operationId,
    table: operationId.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    endpoint: format === undefined ? path : `${path}?format=json`,
    columns: columns.map((p) => ({ name: p.name, type: columnType(root, p.schema) })),
    responsePath: listField === null ? "" : `/${listField}`,
    cursor: cursorParam === undefined || cursorField === undefined
      ? null
      : { param: cursorParam, path: `/${cursorField}` },
  }];
}

export function foreignTables(root: unknown): ForeignTable[] {
  return publicOperations(root).filter((op) => op.method === "GET").flatMap((op) => foreignTable(root, op));
}

function renderTable(table: ForeignTable): string {
  const columns = [...table.columns.map((column) => `${identifier(column.name)} ${column.type}`), "attrs jsonb"];
  const options = Object.entries({
    endpoint: table.endpoint,
    response_path: table.responsePath,
    ...(table.cursor === null ? {} : { cursor_param: table.cursor.param, cursor_path: table.cursor.path }),
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
    max_pages '10'
  );
${tables.map((table) => `\n${renderTable(table)}`).join("")}`;
}
