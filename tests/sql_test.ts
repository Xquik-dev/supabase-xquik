import { assert, assertEquals } from "@std/assert";
import pg, { DatabaseError } from "pg";
import { FOREIGN_TABLES_SUFFIX } from "../scripts/foreign_tables.ts";
import { latestMigration, migrationFiles, operationRows, REGISTRY_SUFFIX, SPEC_PATH } from "../scripts/generate.ts";

type Row = Record<string, unknown>;
type Reply = readonly [status: number, type: string | null, content: string | null];

const XQUIK = "https://xquik.com";
const KEY = { "x-api-key": "xq_test_key" };
const FUNCTIONS = [
  "api_key",
  "build_request",
  "call",
  "collect",
  "enqueue",
  "queueable_request",
  "response_body",
  "rows",
  "schedule",
  "send_action",
];

async function run(command: string, args: string[]): Promise<void> {
  const { success, stdout, stderr } = await new Deno.Command(command, { args }).output();
  if (!success) {
    const decoder = new TextDecoder();
    throw new Error(`${command} ${args.join(" ")} failed\n${decoder.decode(stdout)}${decoder.decode(stderr)}`);
  }
}

async function startCluster(dir: string): Promise<void> {
  const data = `${dir}/data`;
  await run("initdb", [
    ...["-D", data, "-U", "postgres", "-A", "trust", "-E", "UTF8"],
    ...["--locale=C", "--no-sync", "--no-instructions"],
  ]);
  const standIns = await Deno.realPath("tests/sql");
  const settings = [
    "listen_addresses = ''",
    `unix_socket_directories = '${dir}'`,
    `extension_control_path = '${standIns}:$system'`,
  ];
  await Deno.writeTextFile(`${data}/postgresql.conf`, `${settings.join("\n")}\n`, { append: true });
  const log = `${dir}/server.log`;
  await run("pg_ctl", ["-D", data, "-l", log, "-w", "start"]).catch(async (error: unknown) => {
    throw new Error(`${String(error)}\n${await Deno.readTextFile(log)}`, { cause: error });
  });
}

async function query(client: pg.Client, text: string, values: unknown[] = []): Promise<Row[]> {
  return (await client.query<Row, unknown[]>(text, values)).rows;
}

async function applyMigrations(client: pg.Client): Promise<void> {
  await query(client, await Deno.readTextFile("tests/sql/supabase.sql"));
  for (const file of migrationFiles()) await query(client, await Deno.readTextFile(file));
  await query(client, "select vault.create_secret('xq_test_key', 'xquik_api_key')");
}

async function testFunctions(t: Deno.TestContext, client: pg.Client): Promise<void> {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> =>
    query(client, strings.reduce((text, part, index) => `${text}$${index}${part}`), values);

  const step = (name: string, body: () => Promise<void>): Promise<boolean> =>
    t.step(name, async (): Promise<void> => {
      await sql`begin`;
      try {
        await body();
      } finally {
        await sql`rollback`;
      }
    });

  const failure = async (statement: () => Promise<unknown>): Promise<{ message: string; hint?: string }> => {
    await sql`savepoint failure`;
    const error = await statement().then(() => undefined, (reason: unknown) => reason);
    await sql`rollback to savepoint failure`;
    assert(error instanceof DatabaseError, "the statement fails");
    return error.hint === undefined ? { message: error.message } : { message: error.message, hint: error.hint };
  };

  const reply = async (...[status, type, content]: Reply): Promise<void> => {
    await sql`insert into extensions.http_replies (status, content_type, content) values (${status}, ${type}, ${content})`;
  };

  const httpCalls = (): Promise<Row[]> =>
    sql`select (c.request).method, (c.request).uri as url,
        (select jsonb_object_agg(h.field, h.value) from unnest((c.request).headers) h) as headers,
        (c.request).content_type as type, (c.request).content::jsonb as body, c.curlopts
      from extensions.http_calls c order by c.id`;

  const enqueueAnswered = async ([status, type, content]: Reply): Promise<void> => {
    const [action] = await sql`select xquik.enqueue('getAccount') as id`;
    await sql`insert into net._http_response (id, status_code, content_type, content)
      select request_id, ${status}, ${type}, ${content} from public.xquik_actions where id = ${action?.["id"]}`;
  };

  await step("only service_role runs the xquik functions", async () => {
    assertEquals(
      await sql`select p.proname as name,
          has_function_privilege('anon', p.oid, 'execute') as anon,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
          has_function_privilege('service_role', p.oid, 'execute') as service
        from pg_proc p where p.pronamespace = 'xquik'::regnamespace order by p.proname`,
      FUNCTIONS.map((name) => ({ name, anon: false, authenticated: false, service: true })),
    );
  });

  await step("xquik.call sends the method, URL, Vault key and JSON body with a 30 second timeout", async () => {
    await reply(201, "application/json", '{"id": "1"}');
    assertEquals(await sql`select xquik.call('createTweet', '{"text": "hi"}') as answer`, [{ answer: { id: "1" } }]);
    assertEquals(await httpCalls(), [{
      method: "POST",
      url: `${XQUIK}/api/v1/x/tweets`,
      headers: KEY,
      type: "application/json",
      body: { text: "hi" },
      curlopts: { CURLOPT_TIMEOUT_MS: "30000" },
    }]);
  });

  await step("xquik.call fills path parameters and sends the rest as a query for GET and DELETE", async () => {
    await reply(200, "application/json", "{}");
    await sql`select xquik.call('getUser', '{"id": "a b+c/d", "probe": "x y&z"}')`;
    await sql`select xquik.call('deleteDm', '{"userId": 1, "messageId": "m 2"}')`;
    await sql`select xquik.call('getAccount')`;
    await sql`select xquik.call('getAccount', null)`;
    await sql`select xquik.call('updateAccount')`;
    assertEquals((await httpCalls()).map(({ method, url, type, body }) => ({ method, url, type, body })), [
      { method: "GET", url: `${XQUIK}/api/v1/x/users/a%20b%2Bc%2Fd?probe=x+y%26z`, type: null, body: null },
      { method: "DELETE", url: `${XQUIK}/api/v1/x/dm/1/messages/m%202`, type: null, body: null },
      { method: "GET", url: `${XQUIK}/api/v1/account`, type: null, body: null },
      { method: "GET", url: `${XQUIK}/api/v1/account`, type: null, body: null },
      { method: "PATCH", url: `${XQUIK}/api/v1/account`, type: "application/json", body: {} },
    ]);
  });

  await step("xquik.call sends to the xquik_base_url Vault secret without its trailing slash", async () => {
    await reply(200, "application/json", "{}");
    await sql`select vault.create_secret('http://localhost:8080/', 'xquik_base_url')`;
    await sql`select xquik.call('getAccount')`;
    assertEquals((await httpCalls()).map((call) => call["url"]), ["http://localhost:8080/api/v1/account"]);
  });

  await step(
    "xquik.call rejects an unknown operation, non-object parameters and a missing path parameter",
    async () => {
      assertEquals(
        [
          await failure(() => sql`select xquik.call('nope')`),
          await failure(() => sql`select xquik.call('getAccount', '[]')`),
          await failure(() => sql`select xquik.call('getUser', '{}')`),
          await failure(() => sql`select xquik.call('getUser', '{"id": null}')`),
        ],
        [
          {
            message: "Unknown Xquik operation nope",
            hint: "List operation ids with select operation_id from xquik.operations.",
          },
          { message: "Pass the parameters of getAccount as a JSON object" },
          { message: "Xquik operation getUser needs the id parameter" },
          { message: "Xquik operation getUser needs the id parameter" },
        ],
      );
    },
  );

  await step("xquik.call raises with a Vault hint when the xquik_api_key secret is empty or missing", async () => {
    await reply(200, "application/json", "{}");
    await sql`update vault.secrets set secret = '' where name = 'xquik_api_key'`;
    const empty = await failure(() => sql`select xquik.call('getAccount')`);
    await sql`delete from vault.secrets where name = 'xquik_api_key'`;
    const missing = await failure(() => sql`select xquik.call('getAccount')`);
    const expected = {
      message: "The xquik_api_key Vault secret is missing",
      hint: "Run select vault.create_secret('<your key>', 'xquik_api_key').",
    };
    assertEquals([empty, missing], [expected, expected]);
  });

  await step(
    "xquik.call returns a 2xx answer as JSON, other text as a JSON string and no content as null",
    async () => {
      const answers: [Reply, unknown][] = [
        [[200, "application/json", '{"id": "1"}'], { id: "1" }],
        [[299, "Application/Problem+JSON; charset=utf-8", "[1]"], [1]],
        [[200, "text/plain", "pong"], "pong"],
        [[200, null, "pong"], "pong"],
        [[204, "application/json", ""], null],
        [[204, null, null], null],
      ];
      for (const [sent, expected] of answers) {
        await reply(...sent);
        assertEquals(await sql`select xquik.call('getAccount') as answer`, [{ answer: expected }], String(sent));
      }
    },
  );

  await step("xquik.call raises the HTTP status with Xquik's error and message, or with the raw answer", async () => {
    const failures: [Reply, string][] = [
      [
        [404, "application/json", '{"error": "user_not_found", "message": "No user has that handle."}'],
        "HTTP 404. user_not_found. No user has that handle.",
      ],
      [[429, "application/json", '{"error": "rate_limited"}'], "HTTP 429. rate_limited"],
      [[500, "application/json", '{"message": "Try again."}'], "HTTP 500. Try again."],
      [[300, "application/json", '{"location": "/x"}'], 'HTTP 300. {"location": "/x"}'],
      [[502, "text/html", "<h1>Bad gateway</h1>"], "HTTP 502. <h1>Bad gateway</h1>"],
    ];
    for (const [sent, expected] of failures) {
      await reply(...sent);
      assertEquals(await failure(() => sql`select xquik.call('getAccount')`), {
        message: `Xquik getAccount returned ${expected}`,
      });
    }
  });

  await step("xquik.rows returns 1 row per item of the list field, or else the whole answer", async () => {
    const answers: [string, string, unknown[]][] = [
      ["searchTweets", '{"tweets": [{"id": "1"}, {"id": "2"}]}', [{ id: "1" }, { id: "2" }]],
      ["searchTweets", '{"tweets": []}', []],
      ["searchTweets", '{"tweets": {"id": "1"}}', [{ tweets: { id: "1" } }]],
      ["getAccount", '{"tweets": [1, 2]}', [{ tweets: [1, 2] }]],
    ];
    for (const [operation, content, expected] of answers) {
      await reply(200, "application/json", content);
      const rows = await sql`select r as item from xquik.rows(${operation}) r`;
      assertEquals(rows.map((row) => row["item"]), expected, `${operation} ${content}`);
    }
  });

  await step(
    "xquik.enqueue sends GET, POST and DELETE actions with pg_net, the Vault key and a 30 second timeout",
    async () => {
      await sql`select xquik.enqueue('getUser', '{"id": "NASA", "probe": "x y"}')`;
      await sql`select xquik.enqueue('createTweet', '{"text": "hi"}')`;
      await sql`select xquik.enqueue('cancelExtraction', '{"id": "7"}')`;
      await sql`select xquik.enqueue('getAccount')`;
      const headers = { ...KEY, "Content-Type": "application/json" };
      const sent = { status: "sent", headers, timeout: 30000 };
      assertEquals(
        await sql`select a.operation_id as operation, a.params, a.status, q.method, q.url, q.headers, q.body,
          q.timeout_milliseconds::integer as timeout
        from public.xquik_actions a join net.http_request_queue q on q.id = a.request_id order by a.id`,
        [
          {
            ...sent,
            operation: "getUser",
            params: { id: "NASA", probe: "x y" },
            method: "GET",
            url: `${XQUIK}/api/v1/x/users/NASA?probe=x+y`,
            body: null,
          },
          {
            ...sent,
            operation: "createTweet",
            params: { text: "hi" },
            method: "POST",
            url: `${XQUIK}/api/v1/x/tweets`,
            body: { text: "hi" },
          },
          {
            ...sent,
            operation: "cancelExtraction",
            params: { id: "7" },
            method: "DELETE",
            url: `${XQUIK}/api/v1/extractions/7`,
            body: null,
          },
          { ...sent, operation: "getAccount", params: {}, method: "GET", url: `${XQUIK}/api/v1/account`, body: null },
        ],
      );
    },
  );

  await step("the send trigger leaves a row inserted with another status unsent", async () => {
    await sql`insert into public.xquik_actions (operation_id, status, request_id) values ('getUser', 'sent', 42)`;
    assertEquals(await sql`select status, request_id::integer as request from public.xquik_actions`, [
      { status: "sent", request: 42 },
    ]);
    assertEquals(await sql`select id from net.http_request_queue`, []);
  });

  await step("xquik.enqueue rejects PATCH and PUT operations, which pg_net cannot send", async () => {
    const hint = "Run it with select xquik.call(...) instead.";
    assertEquals(
      [
        await failure(() => sql`select xquik.enqueue('updateAccount')`),
        await failure(() => sql`select xquik.enqueue('saveStyle', '{"id": "1"}')`),
      ],
      [
        { message: "Xquik operation updateAccount uses PATCH, and pg_net sends only GET, POST and DELETE", hint },
        { message: "Xquik operation saveStyle uses PUT, and pg_net sends only GET, POST and DELETE", hint },
      ],
    );
  });

  await step("xquik.collect finishes each action pg_net answered and leaves the rest sent", async () => {
    await enqueueAnswered([200, "application/json", '{"ok": true}']);
    await enqueueAnswered([404, "application/json", '{"error": "user_not_found"}']);
    await enqueueAnswered([204, null, ""]);
    await enqueueAnswered([200, "text/plain", "pong"]);
    const [timedOut] = await sql`select xquik.enqueue('getAccount') as id`;
    await sql`insert into net._http_response (id, error_msg)
      select request_id, 'Timeout of 30000 ms reached' from public.xquik_actions where id = ${timedOut?.["id"]}`;
    await sql`select xquik.enqueue('getAccount')`;
    assertEquals(await sql`select xquik.collect() as finished`, [{ finished: 5 }]);
    assertEquals(
      await sql`select status, http_status::integer as code, response, finished_at is not null as finished
        from public.xquik_actions order by id`,
      [
        { status: "succeeded", code: 200, response: { ok: true }, finished: true },
        { status: "failed", code: 404, response: { error: "user_not_found" }, finished: true },
        { status: "succeeded", code: 204, response: null, finished: true },
        { status: "succeeded", code: 200, response: "pong", finished: true },
        { status: "failed", code: null, response: { error: "Timeout of 30000 ms reached" }, finished: true },
        { status: "sent", code: null, response: null, finished: false },
      ],
    );
    assertEquals(await sql`select xquik.collect() as finished`, [{ finished: 0 }]);
  });

  await step("xquik.schedule checks the operation, then schedules a job that enqueues it", async () => {
    assertEquals(
      [
        await failure(() => sql`select xquik.schedule('job', '* * * * *', 'nope')`),
        await failure(() => sql`select xquik.schedule('job', '* * * * *', 'updateAccount')`),
      ].map(({ message }) => message),
      [
        "Unknown Xquik operation nope",
        "Xquik operation updateAccount uses PATCH, and pg_net sends only GET, POST and DELETE",
      ],
    );
    const [nasa] = await sql`select xquik.schedule('nasa', '*/15 * * * *', 'getUser',
      '{"id": "NASA", "note": "it''s"}') as id`;
    const [account] = await sql`select xquik.schedule('account', '0 * * * *', 'getAccount') as id`;
    const jobs = await sql`select jobid as id, jobname as name, schedule, command from cron.job
      where jobname in ('nasa', 'account') order by jobid`;
    assertEquals(jobs.map(({ id, name, schedule }) => ({ id, name, schedule })), [
      { id: nasa?.["id"], name: "nasa", schedule: "*/15 * * * *" },
      { id: account?.["id"], name: "account", schedule: "0 * * * *" },
    ]);
    for (const job of jobs) await query(client, String(job["command"]));
    assertEquals(await sql`select operation_id as operation, params, status from public.xquik_actions order by id`, [
      { operation: "getUser", params: { id: "NASA", note: "it's" }, status: "sent" },
      { operation: "getAccount", params: {}, status: "sent" },
    ]);
  });

  await step(
    "the migration schedules xquik-collect every 10 seconds and drops nonces older than 10 minutes",
    async () => {
      const jobs = await sql`select jobname as name, schedule, command from cron.job
      where jobname like 'xquik-%' order by jobname`;
      assertEquals(jobs.map(({ name, schedule }) => ({ name, schedule })), [
        { name: "xquik-collect", schedule: "10 seconds" },
        { name: "xquik-nonce-cleanup", schedule: "*/5 * * * *" },
      ]);
      const [collect, cleanup] = jobs;
      await enqueueAnswered([200, "application/json", '{"ok": true}']);
      await query(client, String(collect?.["command"]));
      assertEquals(await sql`select status, response from public.xquik_actions`, [
        { status: "succeeded", response: { ok: true } },
      ]);
      await sql`insert into public.xquik_webhook_nonces (nonce, seen_at) values
      ('old', now() - interval '11 minutes'), ('recent', now() - interval '9 minutes'), ('fresh', now())`;
      await query(client, String(cleanup?.["command"]));
      assertEquals(await sql`select nonce from public.xquik_webhook_nonces order by nonce`, [
        { nonce: "fresh" },
        { nonce: "recent" },
      ]);
    },
  );

  await step(
    "rerunning the registry migration restores changed operations and drops stale ones no action uses",
    async () => {
      await sql`update xquik.operations set path = '/old', list_field = 'old' where operation_id = 'getUser'`;
      await sql`insert into xquik.operations (operation_id, method, path, kind)
      values ('staleUnused', 'GET', '/unused', 'read'), ('staleUsed', 'GET', '/used', 'read')`;
      await sql`insert into public.xquik_actions (operation_id, status, request_id, finished_at)
      values ('staleUsed', 'failed', 1, now())`;
      await query(client, await Deno.readTextFile(latestMigration(REGISTRY_SUFFIX)));
      const spec: unknown = JSON.parse(await Deno.readTextFile(SPEC_PATH));
      const expected = [
        ...operationRows(spec).map(({ operationId, method, path, kind, listField }) => ({
          operation: operationId,
          method,
          path,
          kind,
          list: listField,
        })),
        { operation: "staleUsed", method: "GET", path: "/used", kind: "read", list: null },
      ].sort((a, b) => (a.operation < b.operation ? -1 : 1));
      assertEquals(
        await sql`select operation_id as operation, method, path, kind, list_field as list
        from xquik.operations order by operation_id`,
        expected,
      );
    },
  );

  const foreignTablesMigration = await Deno.readTextFile(latestMigration(FOREIGN_TABLES_SUFFIX));
  const foreignTables = (): Promise<Row[]> =>
    sql`select c.relname as name, t.ftoptions as options,
        array(select format('%s %s', a.attname, format_type(a.atttypid, a.atttypmod)) from pg_attribute a
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped order by a.attnum) as columns
      from pg_foreign_table t join pg_class c on c.oid = t.ftrelid
      where c.relnamespace = 'xquik'::regnamespace order by c.relname`;

  await step(
    "rerunning the foreign tables migration rebuilds changed tables, drops stale ones and keeps the rest",
    async () => {
      const fresh = await foreignTables();
      await sql`create view public.nasa_profile as select attrs from xquik.get_user where id = 'NASA'`;
      await sql`alter server xquik_server options (set max_pages '50')`;
      await sql`alter foreign table xquik.search_tweets options (set endpoint '/old')`;
      await sql`alter foreign table xquik.list_draws add column extra text`;
      await sql`create foreign table xquik.stale_read (attrs jsonb) server xquik_server options (endpoint '/stale')`;
      await query(client, foreignTablesMigration);
      assertEquals(await foreignTables(), fresh);
      assertEquals(await sql`select count(*)::int as views from pg_views where viewname = 'nasa_profile'`, [{
        views: 1,
      }]);
      assertEquals(
        await sql`select option_value as pages from pg_options_to_table(
          (select srvoptions from pg_foreign_server where srvname = 'xquik_server')) where option_name = 'max_pages'`,
        [{ pages: "50" }],
      );
    },
  );

  await step("a view on a changed foreign table stops the foreign tables migration until you drop it", async () => {
    const fresh = await foreignTables();
    await sql`create view public.nasa_posts as select attrs from xquik.search_tweets where q = 'NASA'`;
    await sql`alter foreign table xquik.search_tweets options (set endpoint '/old')`;
    assertEquals(await failure(() => query(client, foreignTablesMigration)), {
      message: "cannot drop foreign table xquik.search_tweets because other objects depend on it",
      hint: "Use DROP ... CASCADE to drop the dependent objects too.",
    });
    await sql`drop view public.nasa_posts`;
    await query(client, foreignTablesMigration);
    assertEquals(await foreignTables(), fresh);
  });
}

Deno.test("the SQL functions and triggers on a throwaway Postgres 18 cluster", async (t) => {
  const dir = await Deno.makeTempDir({ dir: "/tmp", prefix: "xquik-sql-" });
  try {
    await startCluster(dir);
    try {
      const client = new pg.Client({ host: dir, user: "postgres", database: "postgres" });
      await client.connect();
      try {
        await applyMigrations(client);
        await testFunctions(t, client);
      } finally {
        await client.end();
      }
    } finally {
      await run("pg_ctl", ["-D", `${dir}/data`, "-m", "fast", "-w", "stop"]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
