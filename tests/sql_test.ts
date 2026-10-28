import { assert, assertEquals, assertMatch, assertNotMatch } from "@std/assert";
import type { Database, SqlStep } from "@/tests/postgres.ts";
import { database, inSequence, key } from "@/tests/postgres.ts";
import callSteps from "@/tests/sql_call_test.ts";
import { Client } from "pg";
import { Constants } from "@shared/database.types.ts";
import foreignTableSteps from "@/tests/sql_foreign_tables_test.ts";
import normalizeTypes from "@/scripts/types.ts";
import queueSteps from "@/tests/sql_queue_test.ts";
import tableSteps from "@/tests/sql_tables_test.ts";

const DENO = "node_modules/.bin/deno";
const SUPABASE = "node_modules/.bin/supabase";
const TYPES = "supabase/functions/_shared/database.types.ts";
const PGTAP_VERSION = "1.3.4";
const PGTAP_ARCHIVE = `https://api.pgxn.org/dist/pgtap/${PGTAP_VERSION}/pgtap-${PGTAP_VERSION}.zip`;
const PGTAP_SHA256 = "2570574a9321082e82433768feb5bffe472ef2ced6b22608a86bfd25f2b88e40";
const MAJOR_MINOR = 2;
const HEX = 16;
const BYTE_DIGITS = 2;
const PROVE = ["--norc", "--failures", "--comments", "--directives", "--recurse", "--ext=.sql", "--ext=.pg"];
const PSQL = "psql --no-psqlrc --no-align --quiet --tuples-only --pset=pager=off --set=ON_ERROR_STOP=1 --file";
const STEPS: readonly SqlStep[] = [...callSteps, ...queueSteps, ...tableSteps, ...foreignTableSteps];

async function run(command: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  const { success, stdout, stderr } = await new Deno.Command(command, { args, env }).output();
  const decoder = new TextDecoder();
  if (!success) {
    throw new Error(`${command} ${args.join(" ")} failed\n${decoder.decode(stdout)}${decoder.decode(stderr)}`);
  }
  return decoder.decode(stdout);
}

async function downloadPgtap(dir: string): Promise<void> {
  const response = await fetch(PGTAP_ARCHIVE);
  const archive = new Uint8Array(await response.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", archive));
  const hex = Array.from(digest, (byte) => byte.toString(HEX).padStart(BYTE_DIGITS, "0")).join("");
  assertEquals(hex, PGTAP_SHA256, PGTAP_ARCHIVE);
  await Deno.writeFile(`${dir}/pgtap.zip`, archive);
}

async function buildPgtap(dir: string): Promise<string> {
  await downloadPgtap(dir);
  const source = `pgtap-${PGTAP_VERSION}`;
  await run("unzip", ["-q", `${dir}/pgtap.zip`, `${source}/pgtap.control`, `${source}/sql/pgtap.sql.in`, "-d", dir]);
  const extension = `${dir}/pgtap/extension`;
  await Deno.mkdir(extension, { recursive: true });
  await Deno.copyFile(`${dir}/${source}/pgtap.control`, `${extension}/pgtap.control`);
  const template = await Deno.readTextFile(`${dir}/${source}/sql/pgtap.sql.in`);
  const script = template.replaceAll("__OS__", Deno.build.os)
    .replaceAll("__VERSION__", PGTAP_VERSION.split(".", MAJOR_MINOR).join("."));
  await Deno.writeTextFile(`${extension}/pgtap--${PGTAP_VERSION}.sql`, script);
  return `${dir}/pgtap`;
}

async function startCluster(dir: string): Promise<void> {
  const data = `${dir}/data`;
  const pgtap = await buildPgtap(dir);
  await run("initdb", [
    "-D",
    data,
    "-U",
    "postgres",
    "-A",
    "trust",
    "-E",
    "utf8",
    "--locale=C",
    "--no-sync",
    "--no-instructions",
  ]);
  const standIns = await Deno.realPath("tests/sql");
  const settings = [
    "listen_addresses = ''",
    `unix_socket_directories = '${dir}'`,
    `extension_control_path = '${standIns}:${pgtap}:$system'`,
  ];
  await Deno.writeTextFile(`${data}/postgresql.conf`, `${settings.join("\n")}\n`, { append: true });
  const log = `${dir}/server.log`;
  await run("pg_ctl", ["-D", data, "-l", log, "-w", "start"]).catch(async (error: unknown) => {
    throw new Error(`${String(error)}\n${await Deno.readTextFile(log)}`, { cause: error });
  });
}

async function withCluster(body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ dir: "/tmp", prefix: "xquik-sql-" });
  try {
    await startCluster(dir);
    try {
      await body(dir);
    } finally {
      await run("pg_ctl", ["-D", `${dir}/data`, "-m", "fast", "-w", "stop"]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

async function withDatabase(dir: string, body: (db: Database) => Promise<void>): Promise<void> {
  const client = new Client({ database: "postgres", host: dir, user: "postgres" });
  await client.connect();
  try {
    await body(database(client));
  } finally {
    await client.end();
  }
}

async function applyMigrations(db: Database, url: string): Promise<void> {
  await db.query(await Deno.readTextFile("tests/sql/supabase.sql"));
  await run(SUPABASE, ["migration", "up", "--db-url", url], { XQUIK_API_KEY: key["x-api-key"] });
}

async function inTransaction(context: Deno.TestContext, db: Database, { name, run: body }: SqlStep): Promise<boolean> {
  return await context.step(name, async (): Promise<void> => {
    await db.sql`begin`;
    try {
      await body(db);
    } finally {
      await db.sql`rollback`;
    }
  });
}

async function testSteps(context: Deno.TestContext, db: Database): Promise<void> {
  const passed = await inSequence(STEPS, async (step) => await inTransaction(context, db, step));
  assertEquals(passed, STEPS.map(() => true), "every SQL step runs and passes");
}

async function formatted(source: string): Promise<string> {
  const child = new Deno.Command(DENO, { args: ["fmt", "--ext=ts", "-"], stdin: "piped", stdout: "piped" }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(source));
  await writer.close();
  const { success, stdout } = await child.output();
  assert(success, "deno fmt formats the generated types");
  return new TextDecoder().decode(stdout);
}

async function testPgtap(context: Deno.TestContext, db: Database, dir: string): Promise<void> {
  await context.step("every pgTAP test passes with no skip or todo, and each file runs exactly its plan", async () => {
    await db.query("create extension pgtap with schema extensions");
    try {
      const report = await run(
        "prove",
        [...PROVE, "--exec", PSQL, "supabase/tests"],
        { PGDATABASE: "postgres", PGHOST: dir, PGOPTIONS: "-c search_path=public,extensions", PGUSER: "postgres" },
      );
      assertMatch(report, /^Result: PASS$/mu);
      assertNotMatch(report, /# (?:skip|todo)\b|skipped:/iu);
    } finally {
      await db.query("drop extension pgtap");
    }
  });
}

async function testCli(context: Deno.TestContext, db: Database, url: string): Promise<void> {
  await context.step("the Supabase advisors report nothing at any level", async () => {
    await db.query("select pg_stat_force_next_flush()");
    await run(SUPABASE, ["db", "advisors", "--db-url", url, "--type", "all", "--level", "info", "--fail-on", "info"]);
  });

  await context.step(`${TYPES} matches supabase gen types for the public schema`, async () => {
    const generated = await run(SUPABASE, ["gen", "types", "typescript", "--db-url", url, "--schema", "public"]);
    const expected = await formatted(normalizeTypes(await formatted(generated)));
    assertEquals(await Deno.readTextFile(TYPES), expected, "Run deno task types.");
    assertEquals(Constants, { public: { Enums: {} } }, "the public schema defines no enum types");
  });

  await context.step("rerunning the index migration rebuilds an index that a failed build left invalid", async () => {
    const index = "'public.xquik_actions_operation_id'::regclass";
    await db.query(`update pg_catalog.pg_index set indisvalid = false where indexrelid = ${index}`);
    await db.query("delete from supabase_migrations.schema_migrations where version = '20261028150128'");
    await run(SUPABASE, ["migration", "up", "--include-all", "--db-url", url], { XQUIK_API_KEY: key["x-api-key"] });
    assertEquals(
      await db.query(`select indisvalid as valid from pg_catalog.pg_index where indexrelid = ${index}`),
      [
        { valid: true },
      ],
    );
  });
}

Deno.test("the SQL functions and triggers on a throwaway Postgres 18 cluster", async (context) => {
  await withCluster(async (dir) => {
    const url = `postgresql://localhost/postgres?user=postgres&host=${encodeURIComponent(dir)}`;
    await withDatabase(dir, async (db) => {
      await applyMigrations(db, url);
      await testSteps(context, db);
      await testPgtap(context, db, dir);
      await testCli(context, db, url);
    });
  });
});
