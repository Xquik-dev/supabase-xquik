import { assertEquals, assertFalse } from "@std/assert";
import { handleDelivery, parseSecrets, verifyDelivery } from "../supabase/functions/_shared/webhook.ts";
import {
  memoryStore,
  NOW,
  post,
  receiver,
  RECEIVER_URL,
  sampleEvent,
  SECRET,
  signDelivery,
  TEST_ALERT,
} from "./delivery.ts";

const encoder = new TextEncoder();
const EVENT = JSON.stringify(sampleEvent("tweet.new"));

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

Deno.test("stores event types it has never seen", async () => {
  const { events, store } = memoryStore();
  const body = JSON.stringify(sampleEvent("tweet.from_the_future"));
  assertEquals((await handleDelivery(post(await signDelivery(body)), receiver(store).deps)).status, 200);
  assertEquals(events.get("9001")?.eventType, "tweet.from_the_future");
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
    return reason(signed);
  }));
  assertEquals(reasons, ["stale", "signature", "signature"]);
});

Deno.test("accepts deliveries signed with any configured secret", async () => {
  const secrets = parseSecrets(`${SECRET}, second-webhook-secret`);
  const { events, store } = memoryStore();
  for (const [index, secret] of secrets.entries()) {
    const body = JSON.stringify(sampleEvent("tweet.new", { streamEventId: `90${index}` }));
    assertEquals(
      (await handleDelivery(post(await signDelivery(body, { secret })), receiver(store, secrets).deps)).status,
      200,
    );
  }
  assertEquals([...events.keys()], ["900", "901"]);
});

Deno.test("answers 503 when the store fails", async () => {
  const failing = [
    { claimNonce: () => Promise.reject(new Error("down")), saveEvent: () => Promise.resolve("new" as const) },
    { claimNonce: () => Promise.resolve("new" as const), saveEvent: () => Promise.reject(new Error("down")) },
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
  const failing = { claimNonce: () => Promise.reject(new Error(SECRET)), saveEvent: store.saveEvent };
  const responses = await Promise.all([
    ...requests.map((request) => handleDelivery(request, receiver(store).deps)),
    handleDelivery(post(await signDelivery(EVENT)), receiver(failing).deps),
  ]);
  assertEquals(new Set(responses.map((response) => response.status)), new Set([200, 401, 405, 503]));
  for (const response of responses) {
    const visible = `${[...response.headers].join(" ")} ${await response.text()}`;
    assertFalse(visible.includes(SECRET));
    assertFalse(visible.includes(signed.signature.slice("sha256=".length)));
  }
});
