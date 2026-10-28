import { assert, assertArrayIncludes, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { Client, DatabaseError } from "pg";
import { http, inSequence, tagged } from "@/tests/postgres.ts";
import { post, randomNonce, sampleEvent, sign, TEST_ALERT } from "@/tests/delivery.ts";
import type { Row, Sql } from "@/tests/postgres.ts";
import parseJson from "@shared/json.ts";
import { z } from "zod";

const REGISTRY_OPERATIONS = 190;
const NON_EMPTY = 1;
const ATTEMPTS = 50;
const ONE_ATTEMPT = 1;
const POLL_MS = 200;
const PLACEHOLDER = /\{(?<name>[^}]+)\}/gu;
const ENV_LINE = /^(?<name>[A-Z_]+)="(?<value>.*)"$/gmu;
const PROBE = { probe: "x y" };
const QUERY = { body: null, query: PROBE };
const BODY = { body: PROBE, query: {} };
const PAYLOADS: Record<string, object> = { DELETE: QUERY, GET: QUERY, PATCH: BODY, POST: BODY, PUT: BODY };
const { stdout } = await new Deno.Command("supabase", { args: ["status", "-o", "env"], stderr: "null" }).output();
const status = new TextDecoder().decode(stdout);
const env = new Map([...status.matchAll(ENV_LINE)].map((match) => [match.groups?.["name"], match.groups?.["value"]]));
const DB_URL = z.string().parse(env.get("DB_URL"));
const FUNCTIONS_URL = z.string().parse(env.get("FUNCTIONS_URL"));
const HOST_FROM_DOCKER = Deno.env.get("XQUIK_STACK_HOST") ?? "host.docker.internal";
const WEBHOOK_SECRET = z.string().min(NON_EMPTY).parse(Deno.env.get("XQUIK_WEBHOOK_SECRET")?.split(",")[0]?.trim());

const operations = z.record(z.string(), z.unknown());
const spec = z.object({ paths: z.record(z.string(), operations) }).parse(
  parseJson(await Deno.readTextFile("openapi.json")),
);
const contract = new Map(
  Object.entries(spec.paths).flatMap(([template, item]) =>
    ["get", "put", "post", "patch", "delete"].flatMap((method) => {
      const op = z.object({ operationId: z.string() }).safeParse(item[method]);
      if (!op.success) {
        return [];
      }
      return [[op.data.operationId, { method: method.toUpperCase(), template }] as const];
    })
  ),
);

async function fakeXquik(sql: Sql, run: (seen: Row[]) => Promise<void>): Promise<void> {
  const seen: Row[] = [];
  const [vaultKey] = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'xquik_api_key'`;
  const listening = Promise.withResolvers<Deno.NetAddr>();
  const server = Deno.serve({ hostname: "0.0.0.0", onListen: listening.resolve, port: 0 }, async (request) => {
    const url = new URL(request.url);
    seen.push({
      body: parseJson((await request.text()) || "null"),
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      sentVaultKey: request.headers.get("x-api-key") === vaultKey?.["decrypted_secret"],
    });
    if (url.pathname.endsWith("/missing")) {
      return Response.json({ error: "user_not_found", message: "No user has that handle." }, { status: 404 });
    }
    return Response.json({ ok: true, tweets: [{ id: "1" }, { id: "2" }] });
  });
  const { port } = await listening.promise;
  await sql`select vault.create_secret(${`http://${HOST_FROM_DOCKER}:${String(port)}`}, 'xquik_base_url')`;
  try {
    await run(seen);
  } finally {
    await sql`delete from vault.secrets where name = 'xquik_base_url'`;
    await server.shutdown();
  }
}

async function settled(sql: Sql, id: string, attempts: number): Promise<Row | undefined> {
  await sql`select xquik.collect()`;
  const [finished] = await sql`select status, http_status, response from public.xquik_actions
    where id = ${id} and status <> 'sent'`;
  if (attempts === ONE_ATTEMPT || finished) {
    return finished;
  }
  const { promise, resolve } = Promise.withResolvers<number>();
  setTimeout(resolve, POLL_MS, attempts);
  await promise;
  return await settled(sql, id, attempts - ONE_ATTEMPT);
}

async function testTables(test: Deno.TestContext, sql: Sql): Promise<void> {
  await test.step("row level security is on for every table the migrations create", async () => {
    const tables = await sql`
      select n.nspname || '.' || c.relname as name, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public', 'xquik') order by 1`;
    assertEquals([...tables], [
      { name: "public.xquik_actions", rls: true },
      { name: "public.xquik_events", rls: true },
      { name: "public.xquik_webhook_nonces", rls: true },
      { name: "xquik.operations", rls: true },
    ]);
    const [index] = await sql`select indexdef from pg_indexes where indexname = 'xquik_events_order'`;
    assertStringIncludes(String(index?.["indexdef"]), "(occurred_at, stream_event_id)");
  });

  await test.step("only service_role executes the xquik functions, as postgres with an empty search_path", async () => {
    const functions = await sql`
      select p.proname as name, p.prosecdef as definer, p.proconfig as config, pg_get_userbyid(p.proowner) as owner,
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
        has_function_privilege('service_role', p.oid, 'execute') as service_role
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'xquik'`;
    assertArrayIncludes(functions.map((fn) => fn["name"]), ["call", "rows", "enqueue", "collect", "schedule"]);
    for (const { name, ...properties } of functions) {
      assertEquals(
        properties,
        {
          anon: false,
          authenticated: false,
          config: ['search_path=""'],
          definer: true,
          owner: "postgres",
          service_role: true,
        },
        String(name),
      );
    }
    await sql`begin`;
    await sql`set local role anon`;
    const denied = await assertRejects(async () => await sql`select xquik.call('getAccount')`, DatabaseError);
    await sql`rollback`;
    assertEquals(denied.code, "42501");
  });
}

async function testCalls(test: Deno.TestContext, sql: Sql): Promise<void> {
  await test.step("xquik.call sends each registry operation's method, path, query and body", async () => {
    const registry = await sql`select operation_id, path from xquik.operations order by operation_id`;
    assertEquals(registry.length, REGISTRY_OPERATIONS);
    await fakeXquik(sql, async (seen) => {
      await inSequence(registry, async ({ operation_id: id }) => {
        const expected = contract.get(String(id));
        assert(expected, `${String(id)} is in openapi.json`);
        const names = [...expected.template.matchAll(PLACEHOLDER)].map((match) => String(match.groups?.["name"]));
        const params = { ...Object.fromEntries(names.map((name) => [name, `NASA ${name}`])), probe: "x y" };
        const earlier = seen.length;
        await sql`select xquik.call(${String(id)}, ${JSON.stringify(params)})`;
        assertEquals(
          seen.slice(earlier),
          [{
            ...PAYLOADS[expected.method],
            method: expected.method,
            path: expected.template.replaceAll(PLACEHOLDER, "NASA%20$<name>"),
            sentVaultKey: true,
          }],
          String(id),
        );
      });
    });
  });

  await test.step("xquik.call raises Xquik's error and message, and xquik.rows returns list items", async () => {
    await fakeXquik(sql, async () => {
      const failure = await assertRejects(async () => await sql`select xquik.call('getUser', '{"id": "missing"}')`);
      assertStringIncludes(String(failure), "user_not_found");
      assertStringIncludes(String(failure), "No user has that handle.");
      const tweets = await sql`select r ->> 'id' as id from xquik.rows('searchTweets', '{"q": "NASA"}') r`;
      assertEquals(tweets.map((row) => row["id"]), ["1", "2"]);
      const account = await sql`select r -> 'ok' as ok from xquik.rows('getAccount') r`;
      assertEquals(account.map((row) => row["ok"]), [true]);
    });
  });
}

async function testWrapper(test: Deno.TestContext, client: Client, sql: Sql): Promise<void> {
  await test.step(
    "xquik.search_tweets sends q and the Vault key through the wrapper and returns each tweet",
    async () => {
      await fakeXquik(sql, async (seen) => {
        const [fake] =
          await sql`select decrypted_secret as url from vault.decrypted_secrets where name = 'xquik_base_url'`;
        await sql`begin`;
        try {
          await client.query<Row, unknown[]>(
            `alter server xquik_server options (set base_url ${client.escapeLiteral(String(fake?.["url"]))})`,
          );
          const tweets = await sql`select attrs ->> 'id' as id from xquik.search_tweets where q = 'NASA'`;
          assertEquals(tweets.map((row) => row["id"]), ["1", "2"]);
        } finally {
          await sql`rollback`;
        }
        assertEquals(seen, [{
          body: null,
          method: "GET",
          path: "/api/v1/x/tweets/search",
          query: Object.fromEntries(new URLSearchParams("q=NASA")),
          sentVaultKey: true,
        }]);
      });
    },
  );
}

async function testQueue(test: Deno.TestContext, sql: Sql): Promise<void> {
  await test.step("xquik.enqueue sends an action with pg_net and xquik.collect finishes it", async () => {
    const finish = async (handle: string): Promise<Row | undefined> => {
      const [{ id } = {}] = await sql`select xquik.enqueue('getUser', ${JSON.stringify({ id: handle })}) as id`;
      const [sent] = await sql`select status, request_id from public.xquik_actions where id = ${String(id)}`;
      assertEquals(sent?.["status"], "sent");
      const finished = await settled(sql, String(id), ATTEMPTS);
      await sql`delete from public.xquik_actions where id = ${String(id)}`;
      return finished;
    };
    await fakeXquik(sql, async (seen) => {
      assertEquals(await finish("NASA"), {
        http_status: "200",
        response: { ok: true, tweets: [{ id: "1" }, { id: "2" }] },
        status: "succeeded",
      });
      assertEquals(await finish("missing"), {
        http_status: "404",
        response: { error: "user_not_found", message: "No user has that handle." },
        status: "failed",
      });
      assertEquals(seen.map(({ method, path }) => `${String(method)} ${String(path)}`), [
        "GET /api/v1/x/users/NASA",
        "GET /api/v1/x/users/missing",
      ]);
    });
    const patch = await assertRejects(async () => await sql`select xquik.enqueue('updateAccount', '{"locale": "en"}')`);
    assertStringIncludes(String(patch), "pg_net sends only GET, POST and DELETE");
  });

  await test.step("xquik.schedule creates a cron job and updates it by name", async () => {
    const [first] = await sql`select xquik.schedule('xquik-test-job', '0 * * * *', 'getUser', '{"id": "NASA"}') as id`;
    const [second] =
      await sql`select xquik.schedule('xquik-test-job', '30 * * * *', 'getUser', '{"id": "NASA"}') as id`;
    assertEquals(second?.["id"], first?.["id"]);
    const jobs = await sql`select schedule, command from cron.job where jobname = 'xquik-test-job'`;
    assertEquals([...jobs], [{
      command: `select xquik.enqueue('getUser', '{"id": "NASA"}'::jsonb)`,
      schedule: "30 * * * *",
    }]);
    await sql`select cron.unschedule('xquik-test-job')`;
  });
}

async function testJobs(test: Deno.TestContext, client: Client, sql: Sql): Promise<void> {
  await test.step("the collect and nonce cleanup cron jobs run and the cleanup keeps fresh nonces", async () => {
    const jobs = await sql`select jobname, schedule, command from cron.job
      where jobname in ('xquik-collect', 'xquik-nonce-cleanup') order by jobname`;
    assertEquals(jobs.map((job) => `${String(job["jobname"])} ${String(job["schedule"])}`), [
      "xquik-collect 10 seconds",
      "xquik-nonce-cleanup */5 * * * *",
    ]);
    await sql`insert into public.xquik_webhook_nonces (nonce, seen_at)
      values ('old-nonce', now() - interval '11 minutes'), ('fresh-nonce', now())`;
    await client.query<Row, unknown[]>(String(jobs[1]?.["command"]));
    const left = await sql`select nonce from public.xquik_webhook_nonces where nonce in ('old-nonce', 'fresh-nonce')`;
    assertEquals(left.map((row) => row["nonce"]), ["fresh-nonce"]);
    await sql`delete from public.xquik_webhook_nonces where nonce = 'fresh-nonce'`;
  });

  await test.step("the receiver function stores a signed delivery once over HTTP without a JWT", async () => {
    const url = `${FUNCTIONS_URL}/xquik-webhook`;
    const send = async (body: string, nonce = randomNonce()): Promise<number> => {
      const timestamp = String(Date.now());
      const headers = new Headers({
        "content-type": "application/json",
        "x-xquik-nonce": nonce,
        "x-xquik-signature": await sign(WEBHOOK_SECRET, timestamp, nonce, body),
        "x-xquik-timestamp": timestamp,
      });
      const response = await fetch(post({ body, headers, signature: "" }, url));
      await response.body?.cancel();
      return response.status;
    };
    const streamEventId = `stack-${randomNonce()}`;
    const event = JSON.stringify(sampleEvent("tweet.new", { streamEventId }));
    const nonce = randomNonce();
    assertEquals(
      [await send(event, nonce), await send(event), await send(event, nonce), await send(JSON.stringify(TEST_ALERT))],
      [http.ok, http.ok, http.unauthorized, http.ok],
    );
    const stored = await sql`select event_type, delivery_id, monitor_id from public.xquik_events
      where stream_event_id = ${streamEventId}`;
    assertEquals([...stored], [{ delivery_id: "502", event_type: "tweet.new", monitor_id: "10" }]);
    await sql`delete from public.xquik_events where stream_event_id = ${streamEventId}`;
  });
}

Deno.test("the Supabase stack", async (test) => {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  const sql = tagged(client);
  try {
    await testTables(test, sql);
    await testCalls(test, sql);
    await testWrapper(test, client, sql);
    await testQueue(test, sql);
    await testJobs(test, client, sql);
  } finally {
    await client.end();
  }
});
