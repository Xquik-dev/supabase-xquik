import { assertArrayIncludes, assertEquals, assertExists } from "@std/assert";
import type { Database, Row, SqlStep } from "@/tests/postgres.ts";
import { http, inSequence } from "@/tests/postgres.ts";
import { latestMigration, REGISTRY_SUFFIX } from "@/scripts/generate.ts";

interface Table {
  readonly column: string;
  readonly name: string;
  readonly row: string;
}

const CLIENT_ROLES = ["anon", "authenticated"];
const TABLES: readonly Table[] = [
  {
    column: "path",
    name: "xquik.operations",
    row: "(operation_id, method, path, kind) values ('probe', 'GET', '/', 'read')",
  },
  {
    column: "params",
    name: "public.xquik_actions",
    row: "(operation_id, status, request_id, finished_at) values ('getAccount', 'failed', 1, now())",
  },
  {
    column: "payload",
    name: "public.xquik_events",
    row: "(stream_event_id, event_type, occurred_at, payload) values ('1', 'tweet.new', now(), '{}')",
  },
  { column: "seen_at", name: "public.xquik_webhook_nonces", row: "(nonce) values ('n')" },
];
const INDEX_NAME = /"Index Name":"(?<name>[^"]+)"/gu;
const EVENTS_PAGE = 100;
const REGISTRY_FILE = latestMigration(REGISTRY_SUFFIX);
assertExists(REGISTRY_FILE, `no *${REGISTRY_SUFFIX} migration`);
const REGISTRY = await Deno.readTextFile(REGISTRY_FILE);

async function plannedIndexes({ query }: Database, statement: string): Promise<string[]> {
  const plan = await query(`explain (format json) ${statement}`);
  return [...JSON.stringify(plan).matchAll(INDEX_NAME)].map((match) => String(match.groups?.["name"]));
}

async function affected({ query }: Database, statement: string): Promise<unknown> {
  const [hit] = await query(`with hit as (${statement} returning 1) select count(*)::integer as n from hit`);
  return hit?.["n"];
}

async function outcomeAs(db: Database, table: Table, role: string): Promise<Row> {
  await db.query(`grant usage on schema xquik to ${role}`);
  await db.query(`grant select, insert, update, delete on ${table.name} to ${role}`);
  await db.query(`set local role ${role}`);
  const [read] = await db.query(`select count(*)::integer as n from ${table.name}`);
  const added = await db.failure(async () => await db.query(`insert into ${table.name} ${table.row}`));
  const changed = await affected(db, `update ${table.name} set ${table.column} = ${table.column}`);
  const removed = await affected(db, `delete from ${table.name}`);
  await db.sql`reset role`;
  return { added: added.message, changed, read: read?.["n"], removed, role, table: table.name };
}

const tableSteps: readonly SqlStep[] = [
  {
    name: "row level security denies anon and authenticated every operation even after a grant",
    run: async (db) => {
      const outcomes = await inSequence(TABLES, async (table) => {
        await db.query(`insert into ${table.name} ${table.row} on conflict do nothing`);
        return await inSequence(CLIENT_ROLES, async (role) => await outcomeAs(db, table, role));
      });
      assertEquals(
        outcomes.flat(),
        TABLES.flatMap((table) =>
          CLIENT_ROLES.map((role) => ({
            added: `new row violates row-level security policy for table "${String(table.name.split(".")[1])}"`,
            changed: 0,
            read: 0,
            removed: 0,
            role,
            table: table.name,
          }))
        ),
      );
    },
  },
  {
    name: "xquik.collect finds the sent actions among finished ones through xquik_actions_sent",
    run: async (db) => {
      await db.sql`insert into public.xquik_actions (operation_id, status, request_id, finished_at)
        select 'getAccount', 'succeeded', n, now() from generate_series(1, 10000) n`;
      await db.enqueueAnswered([http.ok, "application/json", '{"ok": true}']);
      await db.sql`analyze public.xquik_actions`;
      const [collect] = await db.sql`select prosrc as source from pg_proc where oid = 'xquik.collect'::regproc`;
      assertArrayIncludes(await plannedIndexes(db, String(collect?.["source"])), ["xquik_actions_sent"]);
      assertEquals(await db.sql`select xquik.collect() as finished`, [{ finished: 1 }]);
    },
  },
  {
    name: "reading events in order walks xquik_events_order",
    run: async (db) => {
      await db.sql`insert into public.xquik_events (stream_event_id, event_type, occurred_at, payload)
        select n::text, 'tweet.new', timestamptz '2026-10-28' + n * interval '1 second', '{}' from generate_series(1, 10000) n`;
      await db.sql`analyze public.xquik_events`;
      const ordered = `select stream_event_id from public.xquik_events order by occurred_at, stream_event_id limit ${
        String(EVENTS_PAGE)
      }`;
      assertArrayIncludes(await plannedIndexes(db, ordered), ["xquik_events_order"]);
      const events = await db.query(ordered);
      assertEquals(events.length, EVENTS_PAGE);
    },
  },
  {
    name:
      "rerunning the registry migration restores changed operations and drops stale ones no action uses, looking up their actions through xquik_actions_operation_id",
    run: async (db) => {
      await db.sql`update xquik.operations set path = '/old', list_field = 'old' where operation_id = 'getUser'`;
      await db.sql`insert into public.xquik_actions (operation_id, status, request_id, finished_at)
        select o.operation_id, 'succeeded', n, now() from xquik.operations o, generate_series(1, 100) n`;
      await db.sql`insert into xquik.operations (operation_id, method, path, kind)
        values ('staleUnused', 'GET', '/unused', 'read'), ('staleUsed', 'GET', '/used', 'read')`;
      await db.sql`insert into public.xquik_actions (operation_id, status, request_id, finished_at)
        values ('staleUsed', 'failed', 1, now())`;
      await db.sql`analyze public.xquik_actions`;
      assertArrayIncludes(await plannedIndexes(db, REGISTRY), ["xquik_actions_operation_id"]);
      await db.query(REGISTRY);
      assertEquals(
        await db.sql`select operation_id as operation, method, path, kind, list_field as list
          from xquik.operations where operation_id in ('getUser', 'staleUnused', 'staleUsed') order by operation_id`,
        [
          { kind: "read", list: null, method: "GET", operation: "getUser", path: "/api/v1/x/users/{id}" },
          { kind: "read", list: null, method: "GET", operation: "staleUsed", path: "/used" },
        ],
      );
    },
  },
];

export default tableSteps;
