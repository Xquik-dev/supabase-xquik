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

function options(table: ForeignTable): [string, string][] {
  return Object.entries({
    endpoint: table.endpoint,
    response_path: table.responsePath,
    ...(table.cursor === null ? {} : { cursor_param: table.cursor.param, cursor_path: table.cursor.path }),
  });
}

function renderShape(table: ForeignTable): string {
  const columns = [...table.columns.map((column) => `${column.name} ${column.type}`), "attrs jsonb"];
  const settings = options(table).map(([name, value]) => `${name}=${value}`);
  return `          (${literal(table.table)}, array[${settings.map(literal).join(", ")}], array[${
    columns.map(literal).join(", ")
  }])`;
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

export function renderForeignTables(tables: readonly ForeignTable[]): string {
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
${tables.map(renderShape).join(",\n")}
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
