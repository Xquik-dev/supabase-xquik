import { http, inSequence, key, xquik } from "@/tests/postgres.ts";
import type { Reply, Row, Sql, SqlStep } from "@/tests/postgres.ts";
import { assertEquals } from "@std/assert";

const ONE = 1;
const TWO = 2;

async function reply(sql: Sql, [status, type, content]: Reply): Promise<void> {
  await sql`insert into extensions.http_replies (status, content_type, content) values (${status}, ${type}, ${content})`;
}

async function httpCalls(sql: Sql): Promise<Row[]> {
  return await sql`select (c.request).method, (c.request).uri as url,
      (select jsonb_object_agg(h.field, h.value) from unnest((c.request).headers) h) as headers,
      (c.request).content_type as type, (c.request).content::jsonb as body, c.curlopts
    from extensions.http_calls c order by c.id`;
}

const callSteps: readonly SqlStep[] = [
  {
    name: "xquik.call sends the method, URL, Vault key and JSON body with a 30 second timeout",
    run: async ({ sql }) => {
      await reply(sql, [http.created, "application/json", '{"id": "1"}']);
      assertEquals(await sql`select xquik.call('createTweet', '{"text": "hi"}') as answer`, [{ answer: { id: "1" } }]);
      assertEquals(await httpCalls(sql), [{
        body: { text: "hi" },
        curlopts: { CURLOPT_TIMEOUT_MS: "30000" },
        headers: key,
        method: "POST",
        type: "application/json",
        url: `${xquik}/api/v1/x/tweets`,
      }]);
    },
  },
  {
    name: "xquik.call fills path parameters and sends the rest as a query for GET and DELETE",
    run: async ({ sql }) => {
      await reply(sql, [http.ok, "application/json", "{}"]);
      await sql`select xquik.call('getUser', '{"id": "a b+c/d", "probe": "x y&z"}')`;
      await sql`select xquik.call('deleteDm', '{"userId": 1, "messageId": "m 2"}')`;
      await sql`select xquik.call('getAccount')`;
      await sql`select xquik.call('getAccount', null)`;
      await sql`select xquik.call('updateAccount')`;
      const calls = await httpCalls(sql);
      assertEquals(calls.map(({ method, url, type, body }) => ({ body, method, type, url })), [
        { body: null, method: "GET", type: null, url: `${xquik}/api/v1/x/users/a%20b%2Bc%2Fd?probe=x+y%26z` },
        { body: null, method: "DELETE", type: null, url: `${xquik}/api/v1/x/dm/1/messages/m%202` },
        { body: null, method: "GET", type: null, url: `${xquik}/api/v1/account` },
        { body: null, method: "GET", type: null, url: `${xquik}/api/v1/account` },
        { body: {}, method: "PATCH", type: "application/json", url: `${xquik}/api/v1/account` },
      ]);
    },
  },
  {
    name: "xquik.call sends to the xquik_base_url Vault secret without its trailing slash",
    run: async ({ sql }) => {
      await reply(sql, [http.ok, "application/json", "{}"]);
      await reply(sql, [http.created, "application/json", "{}"]);
      await sql`select vault.create_secret('http://localhost:8080/', 'xquik_base_url')`;
      await sql`select xquik.call('getAccount')`;
      await sql`select xquik.call('createTweet', '{"text": "hi"}')`;
      const calls = await httpCalls(sql);
      assertEquals(calls.map((call) => call["url"]), [
        "http://localhost:8080/api/v1/account",
        "http://localhost:8080/api/v1/x/tweets",
      ]);
    },
  },
  {
    name: "xquik.call rejects an unknown operation, non-object parameters and a missing path parameter",
    run: async ({ failure, sql }) => {
      assertEquals(
        [
          await failure(async () => await sql`select xquik.call('nope')`),
          await failure(async () => await sql`select xquik.call('getAccount', '[]')`),
          await failure(async () => await sql`select xquik.call('getUser', '{}')`),
          await failure(async () => await sql`select xquik.call('getUser', '{"id": null}')`),
        ],
        [
          {
            hint: "List operation ids with select operation_id from xquik.operations.",
            message: "Unknown Xquik operation nope",
          },
          { message: "Pass the parameters of getAccount as a JSON object" },
          { message: "Xquik operation getUser needs the id parameter" },
          { message: "Xquik operation getUser needs the id parameter" },
        ],
      );
    },
  },
  {
    name: "xquik.call raises with a Vault hint when the xquik_api_key secret is empty or missing",
    run: async ({ failure, sql }) => {
      await reply(sql, [http.ok, "application/json", "{}"]);
      await sql`update vault.secrets set secret = '' where name = 'xquik_api_key'`;
      const empty = await failure(async () => await sql`select xquik.call('getAccount')`);
      await sql`delete from vault.secrets where name = 'xquik_api_key'`;
      const missing = await failure(async () => await sql`select xquik.call('getAccount')`);
      const expected = {
        hint: "Run select vault.create_secret('<your key>', 'xquik_api_key').",
        message: "The xquik_api_key Vault secret is missing",
      };
      assertEquals([empty, missing], [expected, expected]);
    },
  },
  {
    name: "xquik.call returns a 2xx answer as JSON, other text as a JSON string and no content as null",
    run: async ({ sql }) => {
      const answers: Array<readonly [Reply, unknown]> = [
        [[http.ok, "application/json", '{"id": "1"}'], { id: "1" }],
        [[http.lastSuccess, "Application/Problem+JSON; charset=utf-8", "[1]"], [ONE]],
        [[http.ok, "text/plain", "pong"], "pong"],
        [[http.ok, null, "pong"], "pong"],
        [[http.noContent, "application/json", ""], null],
        [[http.noContent, null, null], null],
      ];
      const returned = await inSequence(answers, async ([sent]) => {
        await reply(sql, sent);
        return await sql`select xquik.call('getAccount') as answer`;
      });
      assertEquals(returned, answers.map(([, expected]) => [{ answer: expected }]));
    },
  },
  {
    name: "xquik.call raises the HTTP status with Xquik's error and message, or with the raw answer",
    run: async ({ failure, sql }) => {
      const failures: Array<readonly [Reply, string]> = [
        [
          [http.notFound, "application/json", '{"error": "user_not_found", "message": "No user has that handle."}'],
          "HTTP 404. user_not_found. No user has that handle.",
        ],
        [[http.tooManyRequests, "application/json", '{"error": "rate_limited"}'], "HTTP 429. rate_limited"],
        [[http.serverError, "application/json", '{"message": "Try again."}'], "HTTP 500. Try again."],
        [[http.multipleChoices, "application/json", '{"location": "/x"}'], 'HTTP 300. {"location": "/x"}'],
        [[http.badGateway, "text/html", "<h1>Bad gateway</h1>"], "HTTP 502. <h1>Bad gateway</h1>"],
      ];
      const raised = await inSequence(failures, async ([sent]) => {
        await reply(sql, sent);
        return await failure(async () => await sql`select xquik.call('getAccount')`);
      });
      assertEquals(raised, failures.map(([, expected]) => ({ message: `Xquik getAccount returned ${expected}` })));
    },
  },
  {
    name: "xquik.rows returns 1 row per item of the list field, or else the whole answer",
    run: async ({ sql }) => {
      const answers: Array<readonly [string, string, unknown[]]> = [
        ["searchTweets", '{"tweets": [{"id": "1"}, {"id": "2"}]}', [{ id: "1" }, { id: "2" }]],
        ["searchTweets", '{"tweets": []}', []],
        ["searchTweets", '{"tweets": {"id": "1"}}', [{ tweets: { id: "1" } }]],
        ["getAccount", '{"tweets": [1, 2]}', [{ tweets: [ONE, TWO] }]],
      ];
      const items = await inSequence(answers, async ([operation, content]) => {
        await reply(sql, [http.ok, "application/json", content]);
        const rows = await sql`select r as item from xquik.rows(${operation}) r`;
        return rows.map((row) => row["item"]);
      });
      assertEquals(items, answers.map((answer) => answer[2]));
    },
  },
];

export default callSteps;
