import { assertEquals, assertFalse } from "@std/assert";
import {
  type DeliveryStore,
  handleDelivery,
  parseSecrets,
  verifyDelivery,
} from "../supabase/functions/_shared/webhook.ts";
import {
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

const encoder = new TextEncoder();
const EVENT = JSON.stringify(sampleEvent("tweet.new"));
const NOT_UTF8 = 0xff;

async function reason(signed: { headers: Headers; body: string }): Promise<string> {
  const verdict = await verifyDelivery(
    { headers: signed.headers, rawBody: encoder.encode(signed.body) },
    [SECRET],
    NOW,
  );
  return verdict.ok ? "accepted" : verdict.reason;
}

Deno.test("verifies the raw body bytes, so a re-serialized body fails", async () => {
  const raw = `{ "eventType": "tweet.new", "streamEventId": "9001", "occurredAt": "2026-02-24T14:22:00.000Z" }`;
  const signed = await signDelivery(raw);
  const { events, store } = memoryStore();
  const reserialized = { ...signed, body: JSON.stringify(JSON.parse(raw)) };
  assertEquals((await handleDelivery(post(reserialized), receiver(store).deps)).status, 401);
  assertEquals((await handleDelivery(post(signed), receiver(store).deps)).status, 200);
  assertEquals(events.size, 1);
});

Deno.test("reads the timestamp as milliseconds, so a seconds timestamp is stale", async () => {
  assertEquals(await reason(await signDelivery(EVENT, { timestamp: String(Math.floor(NOW / 1000)) })), "stale");
});

Deno.test("rejects a delivery signed with another secret", async () => {
  const signed = await signDelivery(EVENT, { secret: "another-secret" });
  assertEquals(await reason(signed), "signature");
  const { events, store } = memoryStore();
  assertEquals((await handleDelivery(post(signed), receiver(store).deps)).status, 401);
  assertEquals(events.size, 0);
});

Deno.test("compares every character of the signature", async () => {
  const signed = await signDelivery(EVENT);
  const hex = signed.signature.slice("sha256=".length);
  const forgeries = [
    hex.slice(0, -1),
    `${hex}0`,
    ...Array.from(hex, (char, index) => hex.slice(0, index) + (char === "0" ? "1" : "0") + hex.slice(index + 1)),
  ];
  for (const forged of forgeries) {
    const headers = new Headers(signed.headers);
    headers.set("x-xquik-signature", `sha256=${forged}`);
    assertEquals(await reason({ headers, body: EVENT }), "signature");
  }
  assertEquals(await reason(signed), "accepted");
});

Deno.test("answers 401 to a replayed nonce", async () => {
  const signed = await signDelivery(EVENT);
  const { events, store } = memoryStore();
  assertEquals((await handleDelivery(post(signed), receiver(store).deps)).status, 200);
  assertEquals((await handleDelivery(post(signed), receiver(store).deps)).status, 401);
  assertEquals(events.size, 1);
});

Deno.test("stores a retry that has a new timestamp, nonce and signature once", async () => {
  const { events, store } = memoryStore();
  const { deps, scheduled } = receiver(store);
  assertEquals((await handleDelivery(post(await signDelivery(EVENT)), deps)).status, 200);
  const retry = await signDelivery(EVENT, { timestamp: String(NOW + 1000) });
  assertEquals((await handleDelivery(post(retry), deps)).status, 200);
  assertEquals([...events.keys()], ["9001"]);
  assertEquals(scheduled.length, 1);
});

Deno.test("deduplicates events on streamEventId", async () => {
  const { events, store } = memoryStore();
  const { deps, scheduled } = receiver(store);
  for (const deliveryId of ["502", "503"]) {
    const body = JSON.stringify(sampleEvent("tweet.new", { deliveryId }));
    assertEquals((await handleDelivery(post(await signDelivery(body)), deps)).status, 200);
  }
  assertEquals(events.get("9001")?.deliveryId, "502");
  assertEquals(events.size, 1);
  assertEquals(scheduled.length, 1);
});

Deno.test("acks the test alert without storing it", async () => {
  const { events, store } = memoryStore();
  const { deps, scheduled } = receiver(store);
  assertEquals((await handleDelivery(post(await signDelivery(JSON.stringify(TEST_ALERT))), deps)).status, 200);
  assertEquals(events.size, 0);
  assertEquals(scheduled.length, 0);
});

Deno.test("ignores a signed body that is not UTF-8", async () => {
  const rawBody = new Uint8Array([
    ...encoder.encode(`${EVENT.slice(0, -1)},"note":"`),
    NOT_UTF8,
    ...encoder.encode('"}'),
  ]);
  const timestamp = String(NOW);
  const headers = new Headers({
    "x-xquik-timestamp": timestamp,
    "x-xquik-nonce": "nonce",
    "x-xquik-signature": await sign(SECRET, timestamp, "nonce", rawBody),
  });
  assertEquals(await verifyDelivery({ headers, rawBody }, [SECRET], NOW), { ok: false, reason: "malformed" });
});

Deno.test("rejects an empty nonce even when the signature covers it", async () => {
  assertEquals(await reason(await signDelivery(EVENT, { nonce: "" })), "signature");
});

Deno.test("stores event types it has never seen, with an occurredAt that has a numeric offset", async () => {
  const { events, store } = memoryStore();
  const body = JSON.stringify({ ...sampleEvent("tweet.from_the_future"), occurredAt: "2026-02-24T17:22:00.000+03:00" });
  assertEquals((await handleDelivery(post(await signDelivery(body)), receiver(store).deps)).status, 200);
  const stored = events.get("9001");
  assertEquals([stored?.eventType, stored?.occurredAt], ["tweet.from_the_future", "2026-02-24T17:22:00.000+03:00"]);
});

Deno.test("acks a signed body that is not an event without storing it", async () => {
  const { events, store } = memoryStore();
  for (const body of ["not json", JSON.stringify({ eventType: "tweet.new" })]) {
    assertEquals((await handleDelivery(post(await signDelivery(body)), receiver(store).deps)).status, 200, body);
  }
  assertEquals(events.size, 0);
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
  for (const [index, secret] of secrets.entries()) {
    const body = JSON.stringify(sampleEvent("tweet.new", { streamEventId: `90${String(index)}` }));
    assertEquals(
      (await handleDelivery(post(await signDelivery(body, { secret })), receiver(store, secrets).deps)).status,
      200,
    );
  }
  assertEquals([...events.keys()], ["900", "901"]);
});

Deno.test("answers 503 when the store fails", async () => {
  const failing = [
    {
      claimNonce: async () => await Promise.reject(new Error("down")),
      saveEvent: async () => await Promise.resolve("new" as const),
    },
    {
      claimNonce: async () => await Promise.resolve("new" as const),
      saveEvent: async () => await Promise.reject(new Error("down")),
    },
  ];
  for (const store of failing) {
    assertEquals((await handleDelivery(post(await signDelivery(EVENT)), receiver(store).deps)).status, 503);
  }
});

Deno.test("answers 405 to anything but POST", async () => {
  const { store } = memoryStore();
  const response = await handleDelivery(new Request(RECEIVER_URL), receiver(store).deps);
  assertEquals(response.status, 405);
  assertEquals(response.headers.get("allow"), "POST");
  const unsigned = await handleDelivery(new Request(RECEIVER_URL, { method: "POST" }), receiver(store).deps);
  assertEquals([unsigned.status, unsigned.headers.get("allow")], [401, null]);
});

Deno.test("answers each outcome with a sentence for the delivery log that shows no secret or signature", async () => {
  const { store } = memoryStore();
  const signed = await signDelivery(EVENT);
  const failing: DeliveryStore = {
    claimNonce: async () => await Promise.reject(new Error(SECRET)),
    saveEvent: async (event) => await store.saveEvent(event),
  };
  const deliveries: (readonly [Request, DeliveryStore])[] = [
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
  const answers: string[] = [];
  for (const [request, using] of deliveries) {
    const response = await handleDelivery(request, receiver(using).deps);
    const text = await response.text();
    const visible = `${[...response.headers].join(" ")} ${text}`;
    assertFalse(visible.includes(SECRET));
    assertFalse(visible.includes(signed.signature.slice("sha256=".length)));
    answers.push(`${String(response.status)} ${text}`);
  }
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
});
