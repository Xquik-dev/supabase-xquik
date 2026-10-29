import { http, inSequence, key, xquik } from "@/tests/postgres.ts";
import type { Reply, SqlStep } from "@/tests/postgres.ts";
import { assertEquals } from "@std/assert";

const ANSWERED: readonly Reply[] = [
  [http.ok, "application/json", '{"ok": true}'],
  [http.notFound, "application/json", '{"error": "user_not_found"}'],
  [http.noContent, null, ""],
  [http.ok, "text/plain", "pong"],
  [http.multipleChoices, "application/json", '{"moved": true}'],
];

const queueSteps: readonly SqlStep[] = [
  {
    name: "xquik.enqueue sends GET, POST and DELETE actions with pg_net, the Vault key and a 30 second timeout",
    run: async ({ sql }) => {
      await sql`select xquik.enqueue('getUser', '{"id": "NASA", "probe": "x y"}')`;
      await sql`select xquik.enqueue('createTweet', '{"text": "hi"}')`;
      await sql`select xquik.enqueue('cancelExtraction', '{"id": "7"}')`;
      await sql`select xquik.enqueue('getAccount')`;
      const headers = { ...key, "Content-Type": "application/json" };
      const sent = { headers, status: "sent", timeout: 30_000 };
      assertEquals(
        await sql`select a.operation_id as operation, a.params, a.status, q.method, q.url, q.headers, q.body,
          q.timeout_milliseconds::integer as timeout
        from public.xquik_actions a join net.http_request_queue q on q.id = a.request_id order by a.id`,
        [
          {
            ...sent,
            body: null,
            method: "GET",
            operation: "getUser",
            params: { id: "NASA", probe: "x y" },
            url: `${xquik}/api/v1/x/users/NASA?probe=x+y`,
          },
          {
            ...sent,
            body: { text: "hi" },
            method: "POST",
            operation: "createTweet",
            params: { text: "hi" },
            url: `${xquik}/api/v1/x/tweets`,
          },
          {
            ...sent,
            body: null,
            method: "DELETE",
            operation: "cancelExtraction",
            params: { id: "7" },
            url: `${xquik}/api/v1/extractions/7`,
          },
          { ...sent, body: null, method: "GET", operation: "getAccount", params: {}, url: `${xquik}/api/v1/account` },
        ],
      );
    },
  },
  {
    name: "the send trigger leaves a row inserted with another status unsent",
    run: async ({ sql }) => {
      await sql`insert into public.xquik_actions (operation_id, status, request_id) values ('getUser', 'sent', 42)`;
      assertEquals(await sql`select status, request_id::integer as request from public.xquik_actions`, [
        { request: 42, status: "sent" },
      ]);
      assertEquals(await sql`select id from net.http_request_queue`, []);
    },
  },
  {
    name: "xquik.enqueue rejects PATCH and PUT operations, which pg_net cannot send",
    run: async ({ failure, sql }) => {
      const hint = "Run it with select xquik.call(...) instead.";
      assertEquals(
        [
          await failure(async () => await sql`select xquik.enqueue('updateAccount')`),
          await failure(async () => await sql`select xquik.enqueue('saveStyle', '{"id": "1"}')`),
        ],
        [
          { hint, message: "Xquik operation updateAccount uses PATCH, and pg_net sends only GET, POST and DELETE" },
          { hint, message: "Xquik operation saveStyle uses PUT, and pg_net sends only GET, POST and DELETE" },
        ],
      );
    },
  },
  {
    name: "xquik.collect finishes each action pg_net answered and leaves the rest sent",
    run: async ({ enqueueAnswered, sql }) => {
      await inSequence(ANSWERED, async (answer) => {
        await enqueueAnswered(answer);
      });
      const [timedOut] = await sql`select xquik.enqueue('getAccount') as id`;
      await sql`insert into net._http_response (id, error_msg)
        select request_id, 'Timeout of 30000 ms reached' from public.xquik_actions where id = ${timedOut?.["id"]}`;
      await sql`select xquik.enqueue('getAccount')`;
      assertEquals(await sql`select xquik.collect() as finished`, [{ finished: 6 }]);
      assertEquals(
        await sql`select status, http_status::integer as code, response, finished_at is not null as finished
          from public.xquik_actions order by id`,
        [
          { code: 200, finished: true, response: { ok: true }, status: "succeeded" },
          { code: 404, finished: true, response: { error: "user_not_found" }, status: "failed" },
          { code: 204, finished: true, response: null, status: "succeeded" },
          { code: 200, finished: true, response: "pong", status: "succeeded" },
          { code: 300, finished: true, response: { moved: true }, status: "failed" },
          { code: null, finished: true, response: { error: "Timeout of 30000 ms reached" }, status: "failed" },
          { code: null, finished: false, response: null, status: "sent" },
        ],
      );
      assertEquals(await sql`select xquik.collect() as finished`, [{ finished: 0 }]);
    },
  },
  {
    name: "xquik.schedule checks the operation, then schedules a job that enqueues it",
    run: async ({ failure, query, sql }) => {
      assertEquals(
        [
          await failure(async () => await sql`select xquik.schedule('job', '* * * * *', 'nope')`),
          await failure(async () => await sql`select xquik.schedule('job', '* * * * *', 'updateAccount')`),
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
      await inSequence(jobs, async (job) => await query(String(job["command"])));
      assertEquals(await sql`select operation_id as operation, params, status from public.xquik_actions order by id`, [
        { operation: "getUser", params: { id: "NASA", note: "it's" }, status: "sent" },
        { operation: "getAccount", params: {}, status: "sent" },
      ]);
    },
  },
  {
    name: "the migration schedules xquik-collect every 10 seconds and drops nonces older than 10 minutes",
    run: async ({ enqueueAnswered, query, sql }) => {
      const jobs = await sql`select jobname as name, schedule, command from cron.job
        where jobname like 'xquik-%' order by jobname`;
      assertEquals(jobs.map(({ name, schedule }) => ({ name, schedule })), [
        { name: "xquik-collect", schedule: "10 seconds" },
        { name: "xquik-nonce-cleanup", schedule: "*/5 * * * *" },
      ]);
      const [collect, cleanup] = jobs;
      await enqueueAnswered([http.ok, "application/json", '{"ok": true}']);
      await query(String(collect?.["command"]));
      assertEquals(await sql`select status, response from public.xquik_actions`, [
        { response: { ok: true }, status: "succeeded" },
      ]);
      await sql`insert into public.xquik_webhook_nonces (nonce, seen_at) values
        ('old', now() - interval '11 minutes'), ('recent', now() - interval '9 minutes'), ('fresh', now())`;
      await query(String(cleanup?.["command"]));
      assertEquals(await sql`select nonce from public.xquik_webhook_nonces order by nonce`, [
        { nonce: "fresh" },
        { nonce: "recent" },
      ]);
    },
  },
];

export default queueSteps;
