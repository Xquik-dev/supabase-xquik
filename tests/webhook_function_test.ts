import { answersInOrder, post, randomNonce, sampleEvent, SECRET, signDelivery, TEST_ALERT } from "./delivery.ts";
import { assert, assertEquals } from "@std/assert";
import parseJson from "@shared/json.ts";

const SECRET_KEY = "sb_secret_webhook_test";
const BACKUP_KEY = "sb_secret_webhook_backup";
const PUBLISHABLE_KEY = "sb_publishable_webhook_test";
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
const LAST = -1;

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

async function loadFunction(supabaseUrl: string): Promise<(request: Request) => Promise<Response>> {
  Deno.env.set("XQUIK_WEBHOOK_SECRET", SECRET);
  Deno.env.set("SUPABASE_URL", supabaseUrl);
  Deno.env.set("SUPABASE_PUBLISHABLE_KEYS", JSON.stringify({ default: PUBLISHABLE_KEY }));
  Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ backup: BACKUP_KEY, default: SECRET_KEY }));
  const { default: webhook } = await import("@/supabase/functions/xquik-webhook/index.ts");
  return async (request) => await webhook.fetch(request);
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
  assertEquals(new Set(received.map((request) => request.apiKey)), new Set([SECRET_KEY]));
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

Deno.test("the xquik-webhook function stores each event once through PostgREST with the default secret key", async () => {
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
      Promise.resolve(new Request("http://localhost/functions/v1/xquik-webhook", { method: "OPTIONS" })),
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
      "405 Send deliveries with POST.",
      "200 Stored the event.",
    ]);
    assertReceived(postgrest.received);
  } finally {
    await postgrest.server.shutdown();
  }
});
