import { FOREIGN_TABLES_SUFFIX, foreignTables, renderForeignTables } from "./foreign_tables.ts";
import { type Method, publicOperations } from "./openapi.ts";
import { literal } from "./sql.ts";

export const SPEC_PATH = "openapi.json";
const MIGRATIONS = "supabase/migrations";
export const REGISTRY_SUFFIX = "_xquik_operations.sql";

export function migrationFiles(): string[] {
  return Deno.readDirSync(MIGRATIONS).map((entry) => `${MIGRATIONS}/${entry.name}`).filter((path) =>
    path.endsWith(".sql")
  ).toArray().sort();
}

export function latestMigration(suffix: string): string {
  const latest = migrationFiles().findLast((path) => path.endsWith(suffix));
  if (latest === undefined) throw new Deno.errors.NotFound(`No *${suffix} migration in ${MIGRATIONS}`);
  return latest;
}

export type OperationRow = {
  readonly operationId: string;
  readonly method: Method;
  readonly path: string;
  readonly kind: "read" | "write";
  readonly listField: string | null;
};

export function operationRows(root: unknown): OperationRow[] {
  return publicOperations(root).map(({ operationId, method, path, listField }): OperationRow => ({
    operationId,
    method,
    path,
    kind: method === "GET" ? "read" : "write",
    listField,
  }));
}

export function renderMigration(rows: readonly OperationRow[]): string {
  const values = rows
    .map((row) => `    (${[row.operationId, row.method, row.path, row.kind, row.listField].map(literal).join(", ")})`)
    .join(",\n");
  return `with registry (operation_id, method, path, kind, list_field) as (
  values
${values}
),
removed as (
  delete from xquik.operations o
  where not exists (select 1 from registry r where r.operation_id = o.operation_id)
    and not exists (select 1 from public.xquik_actions a where a.operation_id = o.operation_id)
)
insert into xquik.operations (operation_id, method, path, kind, list_field)
select operation_id, method, path, kind, list_field from registry
on conflict (operation_id) do update
set method = excluded.method,
    path = excluded.path,
    kind = excluded.kind,
    list_field = excluded.list_field;
`;
}

if (import.meta.main) {
  const root: unknown = JSON.parse(await Deno.readTextFile(SPEC_PATH));
  const rows = operationRows(root);
  const tables = foreignTables(root);
  const migrations = [
    { count: { operations: rows.length }, suffix: REGISTRY_SUFFIX, sql: renderMigration(rows) },
    { count: { foreignTables: tables.length }, suffix: FOREIGN_TABLES_SUFFIX, sql: renderForeignTables(tables) },
  ];
  const files = migrationFiles();
  for (const [offset, { count, suffix, sql }] of migrations.entries()) {
    const latest = files.findLast((path) => path.endsWith(suffix));
    const unchanged = latest !== undefined && await Deno.readTextFile(latest) === sql;
    const stamp = new Date(Date.now() + offset * 1000).toISOString().replace(/\D/g, "").slice(0, 14);
    const file = unchanged ? latest : `${MIGRATIONS}/${stamp}${suffix}`;
    if (!unchanged) await Deno.writeTextFile(file, sql);
    console.log(JSON.stringify({ ...count, file, changed: !unchanged }));
  }
}
