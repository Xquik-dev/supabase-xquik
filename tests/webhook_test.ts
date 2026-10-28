import type { DeliveryDeps, DeliveryStore } from "@shared/webhook.ts";
import { handleDelivery, parseSecrets, verifyDelivery } from "@shared/webhook.ts";
import {
  memoryStore,
  NOW,
  post,
  receiver,
  RECEIVER_URL,
  sampleEvent,
  SECRET,
  signDelivery,
  statusesInOrder,
  TEST_ALERT,
} from "./delivery.ts";
import { assertEquals } from "@std/assert";
import parseJson from "@shared/json.ts";

const encoder = new TextEncoder();
const EVENT = JSON.stringify(sampleEvent("tweet.new"));
const OK = 200;
const UNAUTHORIZED = 401;
const NOT_ALLOWED = 405;
const UNAVAILABLE = 503;
const NO_EVENTS = 0;
const ONE_EVENT = 1;
const MS_PER_SECOND = 1000;
const RETRY_DELAY_MS = 1000;
const START = 0;
const NEXT = 1;
const DROP_LAST = -1;

async function reason(signed: { headers: Headers; body: string }): Promise<string> {
  const verdict = await verifyDelivery(
    { headers: signed.headers, rawBody: encoder.encode(signed.body) },
    [SECRET],
    NOW,
  );
  if (verdict.ok) {
    return "accepted";
  }
  return verdict.reason;
}

async function statusOf(request: Request, deps: DeliveryDeps): Promise<number> {
  const response = await handleDelivery(request, deps);
  return response.status;
}

async function deliver(
  body: string,
  deps: DeliveryDeps,
  options: { readonly secret?: string; readonly timestamp?: string } = {},
): Promise<number> {
  return await statusOf(post(await signDelivery(body, options)), deps);
}

function handlerFor(deps: DeliveryDeps): (request: Request) => Promise<Response> {
  return async (request) => await handleDelivery(request, deps);
}

function flipped(char: string): string {
  if (char === "0") {
    return "1";
  }
  return "0";
}

Deno.test("verifies the raw body bytes, so a re-serialized body fails", async () => {
  const raw = `{ "eventType": "tweet.new", "streamEventId": "9001", "occurredAt": "2026-02-24T14:22:00.000Z" }`;
  const signed = await signDelivery(raw);
  const { events, store } = memoryStore();
  const reserialized = { ...signed, body: JSON.stringify(parseJson(raw)) };
  assertEquals(await statusOf(post(reserialized), receiver(store).deps), UNAUTHORIZED);
  assertEquals(await statusOf(post(signed), receiver(store).deps), OK);
  assertEquals(events.size, ONE_EVENT);
});

Deno.test("reads the timestamp as milliseconds, so a seconds timestamp is stale", async () => {
  const seconds = String(Math.floor(NOW / MS_PER_SECOND));
  assertEquals(await reason(await signDelivery(EVENT, { timestamp: seconds })), "stale");
});

Deno.test("rejects a delivery signed with another secret", async () => {
  const signed = await signDelivery(EVENT, { secret: "another-secret" });
  assertEquals(await reason(signed), "signature");
  const { events, store } = memoryStore();
  assertEquals(await statusOf(post(signed), receiver(store).deps), UNAUTHORIZED);
  assertEquals(events.size, NO_EVENTS);
});

Deno.test("compares every character of the signature", async () => {
  const signed = await signDelivery(EVENT);
  const hex = signed.signature.slice("sha256=".length);
  const forgeries = [
    hex.slice(START, DROP_LAST),
    `${hex}0`,
    ...Array.from(hex, (char, index) => `${hex.slice(START, index)}${flipped(char)}${hex.slice(index + NEXT)}`),
  ];
  const reasons = await Promise.all(forgeries.map(async (forged) => {
    const headers = new Headers(signed.headers);
    headers.set("x-xquik-signature", `sha256=${forged}`);
    return await reason({ body: EVENT, headers });
  }));
  assertEquals(reasons, forgeries.map(() => "signature"));
  assertEquals(await reason(signed), "accepted");
});

Deno.test("answers 401 to a replayed nonce", async () => {
  const signed = await signDelivery(EVENT);
  const { events, store } = memoryStore();
  assertEquals(await statusOf(post(signed), receiver(store).deps), OK);
  assertEquals(await statusOf(post(signed), receiver(store).deps), UNAUTHORIZED);
  assertEquals(events.size, ONE_EVENT);
});

Deno.test("stores a retry that has a new timestamp, nonce and signature once", async () => {
  const { events, store } = memoryStore();
  const { deps, scheduled } = receiver(store);
  assertEquals(await deliver(EVENT, deps), OK);
  assertEquals(await deliver(EVENT, deps, { timestamp: String(NOW + RETRY_DELAY_MS) }), OK);
  assertEquals([...events.keys()], ["9001"]);
  assertEquals(scheduled.length, ONE_EVENT);
});

Deno.test("deduplicates events on streamEventId", async () => {
  const { events, store } = memoryStore();
  const { deps, scheduled } = receiver(store);
  const requests = await Promise.all(["502", "503"].map(async (deliveryId) => {
    const signed = await signDelivery(JSON.stringify(sampleEvent("tweet.new", { deliveryId })));
    return post(signed);
  }));
  assertEquals(await statusesInOrder(handlerFor(deps), requests), [OK, OK]);
  assertEquals(events.get("9001")?.deliveryId, "502");
  assertEquals(events.size, ONE_EVENT);
  assertEquals(scheduled.length, ONE_EVENT);
});

Deno.test("acks the test alert without storing it", async () => {
  const { events, store } = memoryStore();
  const { deps, scheduled } = receiver(store);
  assertEquals(await deliver(JSON.stringify(TEST_ALERT), deps), OK);
  assertEquals(events.size, NO_EVENTS);
  assertEquals(scheduled.length, NO_EVENTS);
});

Deno.test("stores event types it has never seen", async () => {
  const { events, store } = memoryStore();
  const body = JSON.stringify(sampleEvent("tweet.from_the_future"));
  assertEquals(await deliver(body, receiver(store).deps), OK);
  assertEquals(events.get("9001")?.eventType, "tweet.from_the_future");
});

Deno.test("acks a signed body that is not an event without storing it", async () => {
  const { events, store } = memoryStore();
  const bodies = ["not json", JSON.stringify({ eventType: "tweet.new" })];
  const statuses = await Promise.all(bodies.map(async (body) => await deliver(body, receiver(store).deps)));
  assertEquals(statuses, [OK, OK]);
  assertEquals(events.size, NO_EVENTS);
});

Deno.test("rejects a delivery without its timestamp, nonce or signature header", async () => {
  const headers = ["x-xquik-timestamp", "x-xquik-nonce", "x-xquik-signature"];
  const reasons = await Promise.all(headers.map(async (header) => {
    const signed = await signDelivery(EVENT);
    signed.headers.delete(header);
    return await reason(signed);
  }));
  assertEquals(reasons, ["stale", "signature", "signature"]);
});

Deno.test("accepts deliveries signed with any configured secret", async () => {
  const secrets = parseSecrets(`${SECRET}, second-webhook-secret`);
  const { events, store } = memoryStore();
  const requests = await Promise.all(secrets.map(async (secret, index) => {
    const body = JSON.stringify(sampleEvent("tweet.new", { streamEventId: `90${String(index)}` }));
    return post(await signDelivery(body, { secret }));
  }));
  const { deps } = receiver(store, secrets);
  assertEquals(await statusesInOrder(handlerFor(deps), requests), [OK, OK]);
  assertEquals([...events.keys()], ["900", "901"]);
});

Deno.test("answers 503 when the store fails", async () => {
  const rejectsNonce: DeliveryStore = {
    claimNonce: async () => await Promise.reject(new Error("down")),
    saveEvent: async () => await Promise.resolve("new" as const),
  };
  const rejectsEvent: DeliveryStore = {
    claimNonce: async () => await Promise.resolve("new" as const),
    saveEvent: async () => await Promise.reject(new Error("down")),
  };
  const stores = [rejectsNonce, rejectsEvent];
  const statuses = await Promise.all(stores.map(async (store) => await deliver(EVENT, receiver(store).deps)));
  assertEquals(statuses, [UNAVAILABLE, UNAVAILABLE]);
});

Deno.test("answers 405 to anything but POST", async () => {
  const { store } = memoryStore();
  const response = await handleDelivery(new Request(RECEIVER_URL), receiver(store).deps);
  assertEquals(response.status, NOT_ALLOWED);
  assertEquals(response.headers.get("allow"), "POST");
  const unsigned = await handleDelivery(new Request(RECEIVER_URL, { method: "POST" }), receiver(store).deps);
  assertEquals([unsigned.status, unsigned.headers.get("allow")], [UNAUTHORIZED, null]);
});

Deno.test("never puts the secret or the signature in a response", async () => {
  const { store } = memoryStore();
  const signed = await signDelivery(EVENT);
  const requests = [
    post(signed),
    post(signed),
    post(await signDelivery(EVENT, { secret: "another-secret" })),
    post(await signDelivery(EVENT, { timestamp: "0" })),
    post(await signDelivery(JSON.stringify(TEST_ALERT))),
    post(await signDelivery("not json")),
    new Request(RECEIVER_URL),
  ];
  const failing: DeliveryStore = {
    claimNonce: async () => await Promise.reject(new Error(SECRET)),
    saveEvent: async (event) => await store.saveEvent(event),
  };
  const failingRequest = post(await signDelivery(EVENT));
  const responses = await Promise.all([
    ...requests.map(async (request) => await handleDelivery(request, receiver(store).deps)),
    handleDelivery(failingRequest, receiver(failing).deps),
  ]);
  assertEquals(
    new Set(responses.map((response) => response.status)),
    new Set([OK, UNAUTHORIZED, NOT_ALLOWED, UNAVAILABLE]),
  );
  const visible = await Promise.all(responses.map(async (response) => {
    const text = await response.text();
    return `${[...response.headers].join(" ")} ${text}`;
  }));
  const mac = signed.signature.slice("sha256=".length);
  assertEquals(visible.filter((shown) => shown.includes(SECRET) || shown.includes(mac)), []);
});
