import { FOREIGN_TABLES_SUFFIX, foreignTables, renderForeignTables } from "./foreign_tables.ts";
import type { Method, Operation } from "./openapi.ts";
import type { ForeignTable } from "./foreign_tables.ts";
import { literal } from "./sql.ts";
import parseJson from "@shared/json.ts";
import { publicOperations } from "./openapi.ts";

const SPEC_PATH = "openapi.json";
const MIGRATIONS = "supabase/migrations";
const REGISTRY_SUFFIX = "_xquik_operations.sql";
const SECOND_MS = 1000;
const NOT_STAMP = /\.\d{3}Z$|\D/gv;
const SUMMARY_KEYS = ["operations", "foreignTables", "file", "changed"];
const MIGRATION_FILES = Deno.readDirSync(MIGRATIONS)
  .map((entry) => `${MIGRATIONS}/${entry.name}`)
  .filter((path) => path.endsWith(".sql"))
  .toArray()
  .toSorted();

function latestMigration(suffix: string): string | undefined {
  return MIGRATION_FILES.findLast((path) => path.endsWith(suffix));
}

interface OperationRow {
  readonly operationId: string;
  readonly method: Method;
  readonly path: string;
  readonly kind: "read" | "write";
  readonly listField: string | null;
}

function kindOf(method: Method): OperationRow["kind"] {
  if (method === "GET") {
    return "read";
  }
  return "write";
}

function operationRows(operations: readonly Operation[]): OperationRow[] {
  return operations.map(({ operationId, method, path, listField }): OperationRow => ({
    kind: kindOf(method),
    listField,
    method,
    operationId,
    path,
  }));
}

function renderRow(row: OperationRow): string {
  const values = [row.operationId, row.method, row.path, row.kind, row.listField].map((value) => literal(value));
  return `    (${values.join(", ")})`;
}

function renderMigration(rows: readonly OperationRow[]): string {
  const values = rows.map((row) => renderRow(row)).join(",\n");
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

async function readGeneration(): Promise<{ rows: OperationRow[]; tables: ForeignTable[] }> {
  const operations = publicOperations(parseJson(await Deno.readTextFile(SPEC_PATH)));
  return { rows: operationRows(operations), tables: foreignTables(operations) };
}

function stampAt(offset: number): string {
  return new Date(Date.now() + offset * SECOND_MS).toISOString().replaceAll(NOT_STAMP, "");
}

async function saveMigration(sql: string, suffix: string, offset: number): Promise<{ changed: boolean; file: string }> {
  const latest = latestMigration(suffix);
  if (typeof latest === "string" && await Deno.readTextFile(latest) === sql) {
    return { changed: false, file: latest };
  }
  const file = `${MIGRATIONS}/${stampAt(offset)}${suffix}`;
  await Deno.writeTextFile(file, sql);
  return { changed: true, file };
}

if (import.meta.main) {
  const { rows, tables } = await readGeneration();
  const migrations = [
    { count: { operations: rows.length }, sql: renderMigration(rows), suffix: REGISTRY_SUFFIX },
    { count: { foreignTables: tables.length }, sql: renderForeignTables(tables), suffix: FOREIGN_TABLES_SUFFIX },
  ];
  const lines = await Promise.all(migrations.map(async ({ count, sql, suffix }, offset) => {
    const saved = await saveMigration(sql, suffix, offset);
    return `${JSON.stringify({ ...count, ...saved }, SUMMARY_KEYS)}\n`;
  }));
  await Deno.stdout.write(new TextEncoder().encode(lines.join("")));
}

export { latestMigration, readGeneration, REGISTRY_SUFFIX, renderMigration, SPEC_PATH };
export type { OperationRow };
