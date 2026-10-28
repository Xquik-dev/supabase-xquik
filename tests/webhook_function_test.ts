import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { answersInOrder, post, randomNonce, sampleEvent, SECRET, signDelivery, TEST_ALERT } from "./delivery.ts";
import parseJson from "@shared/json.ts";

const FUNCTION = new URL("../supabase/functions/xquik-webhook/index.ts", import.meta.url);
const SERVICE_ROLE_KEY = "service-role-key";
const STORE_DOWN = "store-down";
const BARE_EVENT = { eventType: "tweet.new", occurredAt: "2026-10-28T19:00:00Z", streamEventId: "9002" };
const NASA_EVENT = {
  data: { id: "1893456789012345678", text: "Liftoff." },
  deliveryId: "502",
  eventType: "tweet.new",
  monitorId: "10",
  monitorType: "account",
  occurredAt: "2026-02-24T14:22:00.000Z",
  schemaVersion: 1,
  streamEventId: "9001",
  username: "NASA",
  xUserId: "11348282",
};
const CONNECTION: Deno.ServeHandlerInfo = {
  completed: Promise.resolve(),
  remoteAddr: { hostname: "127.0.0.1", port: 0, transport: "tcp" },
};
const EXIT_FAILURE = 1;
const LAST = -1;

type Handler = (request: Request) => Promise<Response>;
interface Received {
  readonly table: string;
  readonly apiKey: string | null;
  readonly query: string;
  readonly prefer: string | null;
  readonly body: unknown;
}
interface Postgrest {
  readonly url: string;
  readonly received: Received[];
  readonly server: Deno.HttpServer;
}
interface FakeTable {
  readonly column: string;
  readonly inserted: (key: unknown) => Response;
  readonly keys: Set<unknown>;
  readonly repeated: () => Response;
}
interface FakeState {
  readonly received: Received[];
  readonly tables: ReadonlyMap<string, FakeTable>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fakeTables(): ReadonlyMap<string, FakeTable> {
  return new Map<string, FakeTable>([
    ["xquik_events", {
      column: "stream_event_id",
      inserted: (key: unknown): Response => Response.json([{ stream_event_id: key }], { status: 201 }),
      keys: new Set(),
      repeated: (): Response => Response.json([], { status: 201 }),
    }],
    ["xquik_webhook_nonces", {
      column: "nonce",
      inserted: (): Response => new Response(null, { status: 201 }),
      keys: new Set(),
      repeated: (): Response => Response.json({ code: "23505", message: "duplicate key value" }, { status: 409 }),
    }],
  ]);
}

async function receive(request: Request, received: Received[]): Promise<Received> {
  const { pathname, search } = new URL(request.url);
  const entry: Received = {
    apiKey: request.headers.get("apikey"),
    body: parseJson(await request.text()),
    prefer: request.headers.get("prefer"),
    query: search,
    table: pathname.replace("/rest/v1/", ""),
  };
  received.push(entry);
  return entry;
}

function respond(fake: FakeTable, key: unknown): Response {
  if (key === STORE_DOWN) {
    return Response.json({ code: "XX000", message: "The store is down." }, { status: 500 });
  }
  if (fake.keys.has(key)) {
    return fake.repeated();
  }
  fake.keys.add(key);
  return fake.inserted(key);
}

async function answer(request: Request, { received, tables }: FakeState): Promise<Response> {
  const { body, table } = await receive(request, received);
  const fake = tables.get(table);
  assert(fake, `the function writes only to the xquik tables, not ${table}`);
  assert(isRecord(body), "the function sends PostgREST 1 JSON object");
  return respond(fake, body[fake.column]);
}

async function fakePostgrest(): Promise<Postgrest> {
  const received: Received[] = [];
  const tables = fakeTables();
  const listening = Promise.withResolvers<string>();
  const server = Deno.serve({
    hostname: "127.0.0.1",
    onListen: ({ hostname, port }) => {
      listening.resolve(`http://${hostname}:${String(port)}`);
    },
    port: 0,
  }, async (request) => await answer(request, { received, tables }));
  return { received, server, url: await listening.promise };
}

function configure(supabaseUrl: string): void {
  Deno.env.set("XQUIK_WEBHOOK_SECRET", SECRET);
  Deno.env.set("SUPABASE_URL", supabaseUrl);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
}

async function loadFunction(supabaseUrl: string): Promise<Handler> {
  const { serve } = Deno;
  const served: Deno.ServeHandler[] = [];
  configure(supabaseUrl);
  Object.defineProperty(Deno, "serve", {
    configurable: true,
    value: (handler: Deno.ServeHandler) => served.push(handler),
  });
  try {
    await import("@/supabase/functions/xquik-webhook/index.ts");
  } finally {
    Object.defineProperty(Deno, "serve", { configurable: true, value: serve });
  }
  const [handler] = served;
  assert(handler, "the function passes a handler to Deno.serve");
  return async (request) => await handler(request, CONNECTION);
}

async function signedPost(body: unknown, nonce = randomNonce()): Promise<Request> {
  const signed = await signDelivery(JSON.stringify(body), { nonce, timestamp: String(Date.now()) });
  return post(signed);
}

function assertUpserts(received: readonly Received[]): void {
  const upserts = received.filter(({ table }) => table === "xquik_events");
  assertEquals(
    new Set(upserts.map(({ query, prefer }) => `${query} ${String(prefer)}`)),
    new Set([
      "?on_conflict=stream_event_id&select=stream_event_id resolution=ignore-duplicates, return=representation",
    ]),
  );
}

function assertReceived(received: readonly Received[]): void {
  assertEquals(new Set(received.map((request) => request.apiKey)), new Set([SERVICE_ROLE_KEY]));
  assertEquals(received.map((request) => request.table), [
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
  assertEquals(received.at(LAST)?.body, {
    delivery_id: null,
    event_type: "tweet.new",
    monitor_id: null,
    occurred_at: BARE_EVENT.occurredAt,
    payload: BARE_EVENT,
    stream_event_id: "9002",
  });
  assertEquals(received[1]?.body, {
    delivery_id: "502",
    event_type: "tweet.new",
    monitor_id: "10",
    occurred_at: "2026-02-24T14:22:00.000Z",
    payload: NASA_EVENT,
    stream_event_id: "9001",
  });
  assertUpserts(received);
}

Deno.test("the xquik-webhook function stores each event once through PostgREST as the service role", async () => {
  const postgrest = await fakePostgrest();
  try {
    const handle = await loadFunction(postgrest.url);
    const event = sampleEvent("tweet.new");
    const nonce = randomNonce();
    const requests = await Promise.all([
      signedPost(event, nonce),
      signedPost(event),
      signedPost(event, nonce),
      signedPost(TEST_ALERT),
      signedPost(event, STORE_DOWN),
      signedPost(sampleEvent("tweet.new", { streamEventId: STORE_DOWN })),
      Promise.resolve(new Request("http://localhost/functions/v1/xquik-webhook")),
      signedPost(BARE_EVENT),
    ]);
    assertEquals(await answersInOrder(handle, requests), [
      "200 Stored the event.",
      "200 Already stored this event.",
      "401 This nonce was already used.",
      "200 Received the test alert.",
      "503 Could not store the delivery. Xquik will retry it.",
      "503 Could not store the delivery. Xquik will retry it.",
      "405 Send deliveries with POST.",
      "200 Stored the event.",
    ]);
    assertReceived(postgrest.received);
  } finally {
    await postgrest.server.shutdown();
  }
});

Deno.test("the xquik-webhook function refuses to start without SUPABASE_URL", async () => {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-env", "--allow-read", FUNCTION.pathname],
    env: { SUPABASE_URL: "", XQUIK_WEBHOOK_SECRET: SECRET },
  }).output();
  assertEquals(output.code, EXIT_FAILURE);
  assertStringIncludes(new TextDecoder().decode(output.stderr), "Set SUPABASE_URL for the xquik-webhook function.");
});
