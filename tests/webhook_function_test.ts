import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { post, randomNonce, sampleEvent, SECRET, signDelivery, TEST_ALERT } from "./delivery.ts";

const FUNCTION = new URL("../supabase/functions/xquik-webhook/index.ts", import.meta.url);
const SERVICE_ROLE_KEY = "service-role-key";
const STORE_DOWN = "store-down";
const BARE_EVENT = { eventType: "tweet.new", streamEventId: "9002", occurredAt: "2026-10-28T19:00:00Z" };
const CONNECTION: Deno.ServeHandlerInfo = {
  remoteAddr: { transport: "tcp", hostname: "127.0.0.1", port: 0 },
  completed: Promise.resolve(),
};

type Handler = (request: Request) => Promise<Response>;
type Received = { readonly table: string; readonly apiKey: string | null; readonly body: unknown };
type Postgrest = { readonly url: string; readonly received: Received[]; readonly server: Deno.HttpServer };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fakePostgrest(): Postgrest {
  const keys = { "xquik_webhook_nonces": new Set<unknown>(), "xquik_events": new Set<unknown>() };
  const received: Received[] = [];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, async (request) => {
    const table = new URL(request.url).pathname.replace("/rest/v1/", "");
    const body = await request.json();
    received.push({ table, apiKey: request.headers.get("apikey"), body });
    const row = isRecord(body) ? body : {};
    const isNonce = table === "xquik_webhook_nonces";
    const key = isNonce ? row["nonce"] : row["stream_event_id"];
    if (key === STORE_DOWN) return Response.json({ code: "XX000", message: "The store is down." }, { status: 500 });
    const seen = isNonce ? keys["xquik_webhook_nonces"] : keys["xquik_events"];
    const isNew = !seen.has(key);
    seen.add(key);
    if (!isNonce) return Response.json(isNew ? [{ stream_event_id: key }] : [], { status: 201 });
    return isNew
      ? new Response(null, { status: 201 })
      : Response.json({ code: "23505", message: "duplicate key value" }, { status: 409 });
  });
  return { url: `http://127.0.0.1:${server.addr.port}`, received, server };
}

async function loadFunction(supabaseUrl: string, waits: Promise<unknown>[]): Promise<Handler> {
  const serve = Deno.serve;
  const served: Deno.ServeHandler[] = [];
  Deno.env.set("XQUIK_WEBHOOK_SECRET", SECRET);
  Deno.env.set("SUPABASE_URL", supabaseUrl);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
  Object.defineProperty(globalThis, "EdgeRuntime", {
    value: { waitUntil: (promise: Promise<unknown>) => waits.push(promise) },
    configurable: true,
  });
  Object.defineProperty(Deno, "serve", {
    value: (handler: Deno.ServeHandler) => served.push(handler),
    configurable: true,
  });
  try {
    await import("../supabase/functions/xquik-webhook/index.ts");
  } finally {
    Object.defineProperty(Deno, "serve", { value: serve, configurable: true });
  }
  const [handler] = served;
  assert(handler !== undefined, "the function passes a handler to Deno.serve");
  return async (request) => await handler(request, CONNECTION);
}

async function signedPost(body: unknown, nonce = randomNonce()): Promise<Request> {
  return post(await signDelivery(JSON.stringify(body), { timestamp: String(Date.now()), nonce }));
}

Deno.test("the xquik-webhook function stores each event once through PostgREST as the service role", async () => {
  const postgrest = fakePostgrest();
  const waits: Promise<unknown>[] = [];
  const logs: string[] = [];
  const { log, error } = console;
  console.log = (message: unknown): void => {
    logs.push(`log ${String(message)}`);
  };
  console.error = (message: unknown): void => {
    logs.push(`error ${String(message)}`);
  };
  try {
    const handle = await loadFunction(postgrest.url, waits);
    const event = sampleEvent("tweet.new");
    const nonce = randomNonce();
    const statuses = [
      (await handle(await signedPost(event, nonce))).status,
      (await handle(await signedPost(event))).status,
      (await handle(await signedPost(event, nonce))).status,
      (await handle(await signedPost(TEST_ALERT))).status,
      (await handle(await signedPost(event, STORE_DOWN))).status,
      (await handle(await signedPost(sampleEvent("tweet.new", { streamEventId: STORE_DOWN })))).status,
      (await handle(new Request("http://localhost/functions/v1/xquik-webhook"))).status,
      (await handle(await signedPost(BARE_EVENT))).status,
    ];
    await Promise.all(waits);
    assertEquals(statuses, [200, 200, 401, 200, 503, 503, 405, 200]);
    assertEquals(waits.length, 2);
    assertEquals(logs, [
      "log xquik-webhook stored tweet.new event 9001.",
      "error xquik-webhook could not record the nonce. The store is down.",
      "error xquik-webhook could not store the event. The store is down.",
      "log xquik-webhook stored tweet.new event 9002.",
    ]);
    assertEquals(new Set(postgrest.received.map((request) => request.apiKey)), new Set([SERVICE_ROLE_KEY]));
    assertEquals(postgrest.received.map((request) => request.table), [
      "xquik_webhook_nonces",
      "xquik_events",
      "xquik_webhook_nonces",
      "xquik_events",
      "xquik_webhook_nonces",
      "xquik_webhook_nonces",
      "xquik_webhook_nonces",
      "xquik_webhook_nonces",
      "xquik_events",
      "xquik_webhook_nonces",
      "xquik_events",
    ]);
    assertEquals(postgrest.received.at(-1)?.body, {
      stream_event_id: "9002",
      delivery_id: null,
      event_type: "tweet.new",
      monitor_id: null,
      occurred_at: BARE_EVENT.occurredAt,
      payload: BARE_EVENT,
    });
    assertEquals(postgrest.received[1]?.body, {
      stream_event_id: "9001",
      delivery_id: "502",
      event_type: "tweet.new",
      monitor_id: "10",
      occurred_at: "2026-02-24T14:22:00.000Z",
      payload: event,
    });
  } finally {
    console.log = log;
    console.error = error;
    await postgrest.server.shutdown();
  }
});

Deno.test("the xquik-webhook function refuses to start without SUPABASE_URL", async () => {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-env", "--allow-read", FUNCTION.pathname],
    env: { XQUIK_WEBHOOK_SECRET: SECRET, SUPABASE_URL: "" },
  }).output();
  assertEquals(output.code, 1);
  assertStringIncludes(new TextDecoder().decode(output.stderr), "Set SUPABASE_URL for the xquik-webhook function.");
});
