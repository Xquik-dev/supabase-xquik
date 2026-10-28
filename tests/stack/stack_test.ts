import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import pg, { DatabaseError } from "pg";
import { z } from "zod";
import { post, randomNonce, sampleEvent, sign, TEST_ALERT } from "../delivery.ts";

const status = Deno.env.has("DB_URL") ? "" : new TextDecoder().decode(
  (await new Deno.Command("supabase", { args: ["status", "-o", "env"], stderr: "null" }).output()).stdout,
);
const env = new Map([...status.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(([, name, value]) => [name, value]));
const DB_URL = z.string().parse(Deno.env.get("DB_URL") ?? env.get("DB_URL"));
const FUNCTIONS_URL = z.string().parse(Deno.env.get("FUNCTIONS_URL") ?? env.get("FUNCTIONS_URL"));
const HOST_FROM_DOCKER = Deno.env.get("XQUIK_STACK_HOST") ?? "host.docker.internal";
const WEBHOOK_SECRET = z.string().min(1).parse(Deno.env.get("XQUIK_WEBHOOK_SECRET")?.split(",")[0]?.trim());

const spec = z.object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) }).parse(
  JSON.parse(await Deno.readTextFile("openapi.json")),
);
const contract = new Map(
  Object.entries(spec.paths).flatMap(([template, item]) =>
    ["get", "put", "post", "patch", "delete"].flatMap((method) => {
      const op = z.object({ operationId: z.string() }).safeParse(item[method]);
      return op.success ? [[op.data.operationId, { method: method.toUpperCase(), template }] as const] : [];
    })
  ),
);

type Seen = { method: string; path: string; query: Record<string, string>; body: unknown; apiKey: string | null };

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

function tagged(client: pg.Client): Sql {
  return async (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]> =>
    (await client.query<Record<string, unknown>, unknown[]>(
      strings.reduce((text, part, index) => `${text}$${index}${part}`),
      values,
    )).rows;
}

async function fakeXquik(sql: Sql, run: (seen: Seen[]) => Promise<void>): Promise<void> {
  const seen: Seen[] = [];
  const server = Deno.serve({ hostname: "0.0.0.0", port: 0, onListen: () => {} }, async (request) => {
    const url = new URL(request.url);
    seen.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: await request.text().then((text) => text === "" ? null : JSON.parse(text)),
      apiKey: request.headers.get("x-api-key"),
    });
    if (url.pathname.endsWith("/missing")) {
      return Response.json({ error: "user_not_found", message: "No user has that handle." }, { status: 404 });
    }
    return Response.json({ tweets: [{ id: "1" }, { id: "2" }], ok: true });
  });
  await sql`select vault.create_secret(${`http://${HOST_FROM_DOCKER}:${server.addr.port}`}, 'xquik_base_url')`;
  try {
    await run(seen);
  } finally {
    await sql`delete from vault.secrets where name = 'xquik_base_url'`;
    await server.shutdown();
  }
}

Deno.test("the Supabase stack", async (t) => {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const sql = tagged(client);
  try {
    await t.step("row level security is on for every table the migrations create", async () => {
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

    await t.step("only service_role executes the xquik functions, as postgres with an empty search_path", async () => {
      const functions = await sql`
        select p.proname as name, p.prosecdef as definer, p.proconfig as config, pg_get_userbyid(p.proowner) as owner,
          has_function_privilege('anon', p.oid, 'execute') as anon,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
          has_function_privilege('service_role', p.oid, 'execute') as service_role
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'xquik'`;
      const names = functions.map((fn) => fn["name"]);
      for (const name of ["call", "rows", "enqueue", "collect", "schedule"]) assert(names.includes(name), name);
      for (const { name, ...properties } of functions) {
        assertEquals(
          properties,
          {
            definer: name !== "response_body",
            config: ['search_path=""'],
            owner: "postgres",
            anon: false,
            authenticated: false,
            service_role: true,
          },
          String(name),
        );
      }
      await sql`begin`;
      const denied = await sql`set local role anon`
        .then(() => sql`select xquik.call('getAccount')`)
        .then(() => undefined, (error: unknown) => error)
        .finally(() => sql`rollback`);
      assert(denied instanceof DatabaseError);
      assertEquals(denied.code, "42501");
    });

    await t.step("xquik.call sends each registry operation's method, path, query and body", async () => {
      const [vaultKey] = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'xquik_api_key'`;
      const registry = await sql`select operation_id, path from xquik.operations order by operation_id`;
      assertEquals(registry.length, 190);
      await fakeXquik(sql, async (seen) => {
        for (const { operation_id: id } of registry) {
          const expected = contract.get(String(id));
          assert(expected, `${id} is in openapi.json`);
          const names = [...expected.template.matchAll(/\{([^}]+)\}/g)].map(([, name]) => String(name));
          const params = { ...Object.fromEntries(names.map((name) => [name, `NASA ${name}`])), probe: "x y" };
          seen.length = 0;
          await sql`select xquik.call(${String(id)}, ${JSON.stringify(params)})`;
          const sendsQuery = expected.method === "GET" || expected.method === "DELETE";
          assertEquals(
            seen.map(({ apiKey, ...request }) => ({
              ...request,
              sentVaultKey: apiKey === vaultKey?.["decrypted_secret"],
            })),
            [{
              method: expected.method,
              path: names.reduce((path, name) => path.replace(`{${name}}`, `NASA%20${name}`), expected.template),
              query: sendsQuery ? { probe: "x y" } : {},
              body: sendsQuery ? null : { probe: "x y" },
              sentVaultKey: true,
            }],
            String(id),
          );
        }
      });
    });

    await t.step("xquik.call raises Xquik's error and message, and xquik.rows returns list items", async () => {
      await fakeXquik(sql, async () => {
        const failure = await sql`select xquik.call('getUser', '{"id": "missing"}')`.then(
          () => "",
          (error: unknown) => String(error),
        );
        assertStringIncludes(failure, "user_not_found");
        assertStringIncludes(failure, "No user has that handle.");
        const tweets = await sql`select r ->> 'id' as id from xquik.rows('searchTweets', '{"q": "NASA"}') r`;
        assertEquals(tweets.map((row) => row["id"]), ["1", "2"]);
        const account = await sql`select r -> 'ok' as ok from xquik.rows('getAccount') r`;
        assertEquals(account.map((row) => row["ok"]), [true]);
      });
    });

    await t.step(
      "xquik.search_tweets sends q and the Vault key through the wrapper and returns each tweet",
      async () => {
        const [vaultKey] = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'xquik_api_key'`;
        await fakeXquik(sql, async (seen) => {
          const [fake] =
            await sql`select decrypted_secret as url from vault.decrypted_secrets where name = 'xquik_base_url'`;
          await sql`begin`;
          try {
            await client.query<Record<string, unknown>, unknown[]>(
              `alter server xquik_server options (set base_url ${client.escapeLiteral(String(fake?.["url"]))})`,
            );
            const tweets = await sql`select attrs ->> 'id' as id from xquik.search_tweets where q = 'NASA'`;
            assertEquals(tweets.map((row) => row["id"]), ["1", "2"]);
          } finally {
            await sql`rollback`;
          }
          assertEquals(
            seen.map(({ apiKey, ...request }) => ({
              ...request,
              sentVaultKey: apiKey === vaultKey?.["decrypted_secret"],
            })),
            [{ method: "GET", path: "/api/v1/x/tweets/search", query: { q: "NASA" }, body: null, sentVaultKey: true }],
          );
        });
      },
    );

    await t.step("xquik.enqueue sends an action with pg_net and xquik.collect finishes it", async () => {
      await fakeXquik(sql, async (seen) => {
        const finish = async (handle: string) => {
          const [{ id } = {}] = await sql`select xquik.enqueue('getUser', ${JSON.stringify({ id: handle })}) as id`;
          const [sent] = await sql`select status, request_id from public.xquik_actions where id = ${String(id)}`;
          assertEquals(sent?.["status"], "sent");
          let finished: Record<string, unknown> | undefined;
          for (let attempt = 0; attempt < 50 && finished === undefined; attempt++) {
            await sql`select xquik.collect()`;
            [finished] = await sql`select status, http_status, response from public.xquik_actions
              where id = ${String(id)} and status <> 'sent'`;
            if (finished === undefined) await new Promise((resolve) => setTimeout(resolve, 200));
          }
          await sql`delete from public.xquik_actions where id = ${String(id)}`;
          return finished;
        };
        assertEquals(await finish("NASA"), {
          status: "succeeded",
          http_status: "200",
          response: { tweets: [{ id: "1" }, { id: "2" }], ok: true },
        });
        assertEquals(await finish("missing"), {
          status: "failed",
          http_status: "404",
          response: { error: "user_not_found", message: "No user has that handle." },
        });
        assertEquals(seen.map(({ method, path }) => `${method} ${path}`), [
          "GET /api/v1/x/users/NASA",
          "GET /api/v1/x/users/missing",
        ]);
      });
      const patch = await sql`select xquik.enqueue('updateAccount', '{"locale": "en"}')`.then(
        () => "",
        (error: unknown) => String(error),
      );
      assertStringIncludes(patch, "pg_net sends only GET, POST and DELETE");
    });

    await t.step("xquik.schedule creates a cron job and updates it by name", async () => {
      const [first] =
        await sql`select xquik.schedule('xquik-test-job', '0 * * * *', 'getUser', '{"id": "NASA"}') as id`;
      const [second] =
        await sql`select xquik.schedule('xquik-test-job', '30 * * * *', 'getUser', '{"id": "NASA"}') as id`;
      assertEquals(second?.["id"], first?.["id"]);
      const jobs = await sql`select schedule, command from cron.job where jobname = 'xquik-test-job'`;
      assertEquals([...jobs], [{
        schedule: "30 * * * *",
        command: `select xquik.enqueue('getUser', '{"id": "NASA"}'::jsonb)`,
      }]);
      await sql`select cron.unschedule('xquik-test-job')`;
    });

    await t.step("the collect and nonce cleanup cron jobs run and the cleanup keeps fresh nonces", async () => {
      const jobs = await sql`select jobname, schedule, command from cron.job
        where jobname in ('xquik-collect', 'xquik-nonce-cleanup') order by jobname`;
      assertEquals(jobs.map((job) => `${job["jobname"]} ${job["schedule"]}`), [
        "xquik-collect 10 seconds",
        "xquik-nonce-cleanup */5 * * * *",
      ]);
      await sql`insert into public.xquik_webhook_nonces (nonce, seen_at)
        values ('old-nonce', now() - interval '11 minutes'), ('fresh-nonce', now())`;
      await client.query<Record<string, unknown>, unknown[]>(String(jobs[1]?.["command"]));
      const left = await sql`select nonce from public.xquik_webhook_nonces where nonce in ('old-nonce', 'fresh-nonce')`;
      assertEquals(left.map((row) => row["nonce"]), ["fresh-nonce"]);
      await sql`delete from public.xquik_webhook_nonces where nonce = 'fresh-nonce'`;
    });

    await t.step("the receiver function stores a signed delivery once over HTTP without a JWT", async () => {
      const url = `${FUNCTIONS_URL}/xquik-webhook`;
      const deliver = async (body: string, nonce = randomNonce()) => {
        const timestamp = String(Date.now());
        const headers = new Headers({
          "content-type": "application/json",
          "x-xquik-timestamp": timestamp,
          "x-xquik-nonce": nonce,
          "x-xquik-signature": await sign(WEBHOOK_SECRET, timestamp, nonce, body),
        });
        const response = await fetch(post({ headers, body, signature: "" }, url));
        await response.body?.cancel();
        return response.status;
      };
      const streamEventId = `stack-${randomNonce()}`;
      const event = JSON.stringify(sampleEvent("tweet.new", { streamEventId }));
      const nonce = randomNonce();
      assertEquals(await deliver(event, nonce), 200);
      assertEquals(await deliver(event), 200);
      assertEquals(await deliver(event, nonce), 401);
      assertEquals(await deliver(JSON.stringify(TEST_ALERT)), 200);
      const stored = await sql`select event_type, delivery_id, monitor_id from public.xquik_events
        where stream_event_id = ${streamEventId}`;
      assertEquals([...stored], [{ event_type: "tweet.new", delivery_id: "502", monitor_id: "10" }]);
      await sql`delete from public.xquik_events where stream_event_id = ${streamEventId}`;
    });
  } finally {
    await client.end();
  }
});
