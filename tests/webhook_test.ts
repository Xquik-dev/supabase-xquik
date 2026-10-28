import type { DeliveryDeps, DeliveryStore } from "@shared/webhook.ts";
import { handleDelivery, parseSecrets, verifyDelivery } from "@shared/webhook.ts";
import {
  answersInOrder,
  memoryStore,
  NOW,
  post,
  receiver,
  RECEIVER_URL,
  sampleEvent,
  SECRET,
  sign,
  signDelivery,
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
const NOT_UTF8 = 0xFF;

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
  const answers = await answersInOrder(handlerFor(deps), requests);
  assertEquals(answers, ["200 Stored the event.", "200 Already stored this event."]);
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

Deno.test("ignores a signed body that is not UTF-8", async () => {
  const rawBody = new Uint8Array([
    ...encoder.encode(`${EVENT.slice(START, DROP_LAST)},"note":"`),
    NOT_UTF8,
    ...encoder.encode('"}'),
  ]);
  const timestamp = String(NOW);
  const headers = new Headers({
    "x-xquik-nonce": "nonce",
    "x-xquik-signature": await sign(SECRET, timestamp, "nonce", rawBody),
    "x-xquik-timestamp": timestamp,
  });
  assertEquals(await verifyDelivery({ headers, rawBody }, [SECRET], NOW), { ok: false, reason: "malformed" });
});

Deno.test("rejects an empty nonce even when the signature covers it", async () => {
  assertEquals(await reason(await signDelivery(EVENT, { nonce: "" })), "signature");
});

Deno.test("stores event types it has never seen, with an occurredAt that has a numeric offset", async () => {
  const { events, store } = memoryStore();
  const body = JSON.stringify({ ...sampleEvent("tweet.from_the_future"), occurredAt: "2026-02-24T17:22:00.000+03:00" });
  assertEquals(await deliver(body, receiver(store).deps), OK);
  const stored = events.get("9001");
  assertEquals([stored?.eventType, stored?.occurredAt], ["tweet.from_the_future", "2026-02-24T17:22:00.000+03:00"]);
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
  assertEquals(await answersInOrder(handlerFor(deps), requests), ["200 Stored the event.", "200 Stored the event."]);
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

Deno.test("answers each outcome with a sentence for the delivery log that shows no secret or signature", async () => {
  const { store } = memoryStore();
  const signed = await signDelivery(EVENT);
  const failing: DeliveryStore = {
    claimNonce: async () => await Promise.reject(new Error(SECRET)),
    saveEvent: async (event) => await store.saveEvent(event),
  };
  const deliveries: ReadonlyArray<readonly [Request, DeliveryStore]> = [
    [post(signed), store],
    [post(signed), store],
    [post(await signDelivery(EVENT)), store],
    [post(await signDelivery(EVENT, { secret: "another-secret" })), store],
    [post(await signDelivery(EVENT, { timestamp: "0" })), store],
    [post(await signDelivery(JSON.stringify(TEST_ALERT))), store],
    [post(await signDelivery("not json")), store],
    [new Request(RECEIVER_URL), store],
    [post(await signDelivery(EVENT)), failing],
  ];
  const shown: Array<[string, string]> = [];
  const answers = await answersInOrder(async ([request, using]): Promise<Response> => {
    const response = await handleDelivery(request, receiver(using).deps);
    shown.push(...response.headers);
    return response;
  }, deliveries);
  assertEquals(answers, [
    "200 Stored the event.",
    "401 This nonce was already used.",
    "200 Already stored this event.",
    "401 The signature does not match.",
    "401 The timestamp is more than 5 minutes off.",
    "200 Received the test alert.",
    "200 Ignored a signed body that is not an Xquik event.",
    "405 Send deliveries with POST.",
    "503 Could not store the delivery. Xquik will retry it.",
  ]);
  const mac = signed.signature.slice("sha256=".length);
  assertEquals(shown.flat().filter((value) => value.includes(SECRET) || value.includes(mac)), []);
});
