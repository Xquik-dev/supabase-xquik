import { identifier, literal } from "./sql.ts";
import type { Operation, Parameter } from "./openapi.ts";

const FOREIGN_TABLES_SUFFIX = "_xquik_foreign_tables.sql";
const UPPERCASE = /[A-Z]/gv;

type ColumnType = "text" | "bigint" | "double precision" | "boolean";
type Option = readonly [name: string, value: string];

interface Column {
  readonly name: string;
  readonly type: ColumnType;
}

interface ForeignTable {
  readonly operationId: string;
  readonly table: string;
  readonly endpoint: string;
  readonly columns: readonly Column[];
  readonly responsePath: string;
  readonly cursor: { readonly param: string; readonly path: string } | null;
}

const CURSOR_PARAMS = ["cursor", "afterCursor"];
const CURSOR_FIELDS = ["next_cursor", "nextCursor"];

const COLUMN_TYPES = new Map<string | null, ColumnType>([
  ["boolean", "boolean"],
  ["integer", "bigint"],
  ["number", "double precision"],
]);

function cursorOf(parameters: readonly Parameter[], json: Operation["json"]): ForeignTable["cursor"] {
  const cursorParam = CURSOR_PARAMS.find((name) =>
    parameters.some((parameter) => parameter.in === "query" && parameter.name === name)
  );
  const cursorField = CURSOR_FIELDS.find((name) => json?.properties.has(name) === true);
  if (typeof cursorParam === "string" && typeof cursorField === "string") {
    return { param: cursorParam, path: `/${cursorField}` };
  }
  return null;
}

function endpointOf(path: string, format: Parameter | undefined): string {
  if (format) {
    return `${path}?format=json`;
  }
  return path;
}

function responsePathOf(listField: string | null): string {
  if (listField === null) {
    return "";
  }
  return `/${listField}`;
}

function foreignTable({ operationId, path, parameters, json, listField }: Operation): ForeignTable[] {
  const format = parameters.find((parameter) =>
    parameter.in === "query" && parameter.name === "format" && parameter.enum.includes("json")
  );
  if (!format && !json) {
    return [];
  }
  const columns = [
    ...parameters.filter((parameter) => parameter.in === "path"),
    ...parameters.filter((parameter) => parameter.in === "query" && parameter !== format),
  ];
  return [{
    columns: columns.map((column) => ({ name: column.name, type: COLUMN_TYPES.get(column.type) ?? "text" })),
    cursor: cursorOf(parameters, json),
    endpoint: endpointOf(path, format),
    operationId,
    responsePath: responsePathOf(listField),
    table: operationId.replaceAll(UPPERCASE, (letter) => `_${letter.toLowerCase()}`),
  }];
}

function foreignTables(operations: readonly Operation[]): ForeignTable[] {
  return operations.filter((op) => op.method === "GET").flatMap((op) => foreignTable(op));
}

function options({ cursor, endpoint, responsePath }: ForeignTable): Option[] {
  const always: Option[] = [["endpoint", endpoint], ["response_path", responsePath]];
  if (cursor === null) {
    return always;
  }
  return [...always, ["cursor_param", cursor.param], ["cursor_path", cursor.path]];
}

function literals(values: readonly string[]): string {
  return values.map((value) => literal(value)).join(", ");
}

function renderShape(table: ForeignTable): string {
  const columns = [...table.columns.map((column) => `${column.name} ${column.type}`), "attrs jsonb"];
  const settings = options(table).map(([name, value]) => `${name}=${value}`);
  return `          (${literal(table.table)}, array[${literals(settings)}], array[${literals(columns)}])`;
}

function renderTable(table: ForeignTable): string {
  const columns = [...table.columns.map((column) => `${identifier(column.name)} ${column.type}`), "attrs jsonb"];
  return `create foreign table if not exists xquik.${table.table} (
${columns.map((column) => `  ${column}`).join(",\n")}
)
  server xquik_server
  options (${options(table).map(([name, value]) => `${name} ${literal(value)}`).join(", ")});
`;
}

function renderForeignTables(tables: readonly ForeignTable[]): string {
  return `set local lock_timeout = '5s';
set local statement_timeout = '1min';

do $$
declare
  stale record;
begin
  for stale in
    select c.relname as name
    from pg_foreign_table t
    join pg_class c on c.oid = t.ftrelid
    join pg_foreign_server s on s.oid = t.ftserver
    where c.relnamespace = 'xquik'::regnamespace and s.srvname = 'xquik_server'
      and not exists (
        select from (values
${tables.map((table) => renderShape(table)).join(",\n")}
        ) wanted (name, options, columns)
        where (wanted.name, wanted.options, wanted.columns) = (
          c.relname::text,
          t.ftoptions,
          array(
            select format('%s %s', a.attname, format_type(a.atttypid, a.atttypmod))
            from pg_attribute a
            where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            order by a.attnum
          )
        )
      )
  loop
    execute format('drop foreign table xquik.%I', stale.name);
  end loop;
end
$$;
${tables.map((table) => `\n${renderTable(table)}`).join("")}`;
}

export { FOREIGN_TABLES_SUFFIX, foreignTables, renderForeignTables };
export type { ForeignTable };
