import { assertEquals, assertExists } from "@std/assert";
import { latestMigration, SPEC_PATH } from "@/scripts/generate.ts";
import type { Row, Sql, SqlStep } from "@/tests/postgres.ts";
import { FOREIGN_TABLES_SUFFIX } from "@/scripts/foreign_tables.ts";
import parseJson from "@shared/json.ts";
import { securityRequirements } from "@/scripts/openapi.ts";
import { z } from "zod";

interface PublicGet {
  readonly id: string;
  readonly path: string;
  readonly table: string;
}

const NONE = 0;
const LAST = -1;
const NO_JSON_ANSWER = ["downloadSupportAttachment", "streamEvents"];
const PLACEHOLDER = /\{(?<name>[^}]+)\}/gu;
const getOperation = z.object({ operationId: z.string(), security: securityRequirements.optional() });
const pathItem = z.object({ get: getOperation.optional() });
const spec = z.object({ paths: z.record(z.string(), pathItem), security: securityRequirements }).parse(
  parseJson(await Deno.readTextFile(SPEC_PATH)),
);
const catalogTable = z.object({
  columns: z.array(z.string()),
  name: z.string(),
  options: z.record(z.string(), z.string()),
});
const catalogTables = z.array(catalogTable);
const MIGRATION_FILE = latestMigration(FOREIGN_TABLES_SUFFIX);
assertExists(MIGRATION_FILE, `no *${FOREIGN_TABLES_SUFFIX} migration`);
const MIGRATION = await Deno.readTextFile(MIGRATION_FILE);

function publicGet(path: string, get: z.infer<typeof getOperation> | undefined): PublicGet[] {
  if (!get) {
    return [];
  }
  const security = get.security ?? spec.security;
  if (!security.some((requirement) => Object.keys(requirement).length === NONE || "apiKey" in requirement)) {
    return [];
  }
  return [{
    id: get.operationId,
    path,
    table: get.operationId.replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`),
  }];
}

const publicGets = Object.entries(spec.paths).flatMap(([path, { get }]) => publicGet(path, get));
const readable = publicGets.filter(({ id }) => !NO_JSON_ANSWER.includes(id));

function assertOnPath(table: z.infer<typeof catalogTable> | undefined, { path, table: name }: PublicGet): void {
  assertEquals(table?.options["endpoint"]?.split("?")[0], path, name);
  const columns = table?.columns.map((column) => column.split(" ")[0]) ?? [];
  const placeholders = [...path.matchAll(PLACEHOLDER)].map((match) => match.groups?.["name"]);
  assertEquals(placeholders.filter((placeholder) => !columns.includes(placeholder)), [], name);
  assertEquals(table?.columns.at(LAST), "attrs jsonb", name);
}

async function foreignTables(sql: Sql): Promise<z.infer<typeof catalogTables>> {
  return catalogTables.parse(
    await sql`select c.relname as name,
        (select jsonb_object_agg(option_name, option_value) from pg_options_to_table(t.ftoptions)) as options,
        array(select format('%s %s', a.attname, format_type(a.atttypid, a.atttypmod)) from pg_attribute a
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped order by a.attnum) as columns
      from pg_foreign_table t join pg_class c on c.oid = t.ftrelid
      where c.relnamespace = 'xquik'::regnamespace order by c.relname`,
  );
}

async function oids(sql: Sql): Promise<Row[]> {
  return await sql`select relname as name, oid from pg_class
    where relnamespace = 'xquik'::regnamespace and relkind = 'f' order by relname`;
}

async function changeForeignTables(sql: Sql): Promise<void> {
  await sql`create view public.nasa_profile as select attrs from xquik.get_user where id = 'NASA'`;
  await sql`alter server xquik_server options (set max_pages '50')`;
  await sql`alter foreign table xquik.search_tweets options (set endpoint '/old')`;
  await sql`alter foreign table xquik.list_draws add column extra text`;
  await sql`create foreign table xquik.stale_read (attrs jsonb) server xquik_server options (endpoint '/stale')`;
}

const foreignTableSteps: readonly SqlStep[] = [
  {
    name: "every public GET operation that answers with JSON has a foreign table on its path with its path parameters",
    run: async ({ sql }) => {
      const catalog = await foreignTables(sql);
      const tables = new Map(catalog.map((table) => [table.name, table]));
      assertEquals(NO_JSON_ANSWER.filter((id) => publicGets.some((read) => read.id === id)), NO_JSON_ANSWER);
      assertEquals(
        [...tables.keys()].toSorted(),
        readable.map(({ table }) => table).toSorted(),
        `${String(tables.size)} of ${String(publicGets.length)} public GET operations have a foreign table.`,
      );
      for (const read of readable) {
        assertOnPath(tables.get(read.table), read);
      }
    },
  },
  {
    name: "list reads unwrap their list and page by their cursor, single reads keep the whole answer",
    run: async ({ sql }) => {
      const catalog = await foreignTables(sql);
      const tables = new Map(catalog.map(({ name, options, columns }) => [name, { columns, options }]));
      assertEquals(tables.get("search_tweets")?.options, {
        cursor_param: "cursor",
        cursor_path: "/next_cursor",
        endpoint: "/api/v1/x/tweets/search",
        response_path: "/tweets",
      });
      assertEquals(tables.get("list_draws")?.options, {
        cursor_param: "cursor",
        cursor_path: "/nextCursor",
        endpoint: "/api/v1/draws",
        response_path: "/draws",
      });
      assertEquals(tables.get("list_drafts")?.options["cursor_param"], "afterCursor");
      assertEquals(tables.get("list_drafts")?.options["cursor_path"], "/nextCursor");
      assertEquals(tables.get("get_user")?.options, { endpoint: "/api/v1/x/users/{id}", response_path: "" });
      assertEquals(tables.get("export_draw"), {
        columns: ["id text", "type text", "attrs jsonb"],
        options: { endpoint: "/api/v1/draws/{id}/export?format=json", response_path: "" },
      });
    },
  },
  {
    name: "rerunning the foreign tables migration rebuilds only changed tables, drops stale ones and keeps the rest",
    run: async ({ query, sql }) => {
      const fresh = await foreignTables(sql);
      const before = await oids(sql);
      const freshOids = new Map(before.map(({ name, oid }) => [name, oid]));
      await changeForeignTables(sql);
      await query(MIGRATION);
      assertEquals(await foreignTables(sql), fresh);
      const after = await oids(sql);
      assertEquals(after.filter(({ name, oid }) => freshOids.get(name) !== oid).map(({ name }) => name), [
        "list_draws",
        "search_tweets",
      ]);
      assertEquals(await sql`select count(*)::int as views from pg_views where viewname = 'nasa_profile'`, [{
        views: 1,
      }]);
      assertEquals(
        await sql`select option_value as pages from pg_options_to_table(
          (select srvoptions from pg_foreign_server where srvname = 'xquik_server')) where option_name = 'max_pages'`,
        [{ pages: "50" }],
      );
    },
  },
  {
    name: "a view on a changed foreign table stops the foreign tables migration until you drop it",
    run: async ({ failure, query, sql }) => {
      const fresh = await foreignTables(sql);
      await sql`create view public.nasa_posts as select attrs from xquik.search_tweets where q = 'NASA'`;
      await sql`alter foreign table xquik.search_tweets options (set endpoint '/old')`;
      assertEquals(await failure(async () => await query(MIGRATION)), {
        hint: "Use DROP ... CASCADE to drop the dependent objects too.",
        message: "cannot drop foreign table xquik.search_tweets because other objects depend on it",
      });
      await sql`drop view public.nasa_posts`;
      await query(MIGRATION);
      assertEquals(await foreignTables(sql), fresh);
    },
  },
];

export default foreignTableSteps;
