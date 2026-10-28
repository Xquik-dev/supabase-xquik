import type { DeliveryDeps, DeliveryStore, MonitorEvent } from "@shared/webhook.ts";

const SECRET = "first-webhook-secret";
const NOW = Date.parse("2026-10-28T19:00:00.000Z");
const RECEIVER_URL = "http://localhost/functions/v1/xquik-webhook";
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

const encoder = new TextEncoder();
const EXTRACTABLE = false;

interface SampleEvent {
  eventType: string;
  schemaVersion: number;
  deliveryId: string;
  streamEventId: string;
  occurredAt: string;
  monitorId: string;
  monitorType: string;
  username: string;
  xUserId: string;
  data: { id: string; text: string };
}

function sampleEvent(
  eventType: string,
  ids: { streamEventId?: string; deliveryId?: string } = {},
): SampleEvent {
  return {
    data: { id: "1893456789012345678", text: "Liftoff." },
    deliveryId: ids.deliveryId ?? "502",
    eventType,
    monitorId: "10",
    monitorType: "account",
    occurredAt: "2026-02-24T14:22:00.000Z",
    schemaVersion: 1,
    streamEventId: ids.streamEventId ?? "9001",
    username: "NASA",
    xUserId: "11348282",
  };
}

const TEST_ALERT = {
  data: { message: "Test delivery from Xquik" },
  eventType: "webhook.test",
  timestamp: "2026-10-28T19:00:00.000Z",
};

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0")).join("");
}

function bytesOf(body: string | Uint8Array): Uint8Array {
  if (typeof body === "string") {
    return encoder.encode(body);
  }
  return body;
}

async function sign(secret: string, timestamp: string, nonce: string, body: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    EXTRACTABLE,
    ["sign"],
  );
  const message = new Uint8Array([...encoder.encode(`${timestamp}.${nonce}.`), ...bytesOf(body)]);
  const mac = await crypto.subtle.sign("HMAC", key, message);
  return `sha256=${hex(new Uint8Array(mac))}`;
}

function randomNonce(): string {
  return crypto.randomUUID();
}

interface Signed {
  readonly headers: Headers;
  readonly body: string;
  readonly signature: string;
}

async function signDelivery(
  body: string,
  { secret = SECRET, timestamp = String(NOW), nonce = randomNonce() } = {},
): Promise<Signed> {
  const signature = await sign(secret, timestamp, nonce, body);
  const headers = new Headers({
    "x-xquik-nonce": nonce,
    "x-xquik-signature": signature,
    "x-xquik-timestamp": timestamp,
  });
  return { body, headers, signature };
}

function post({ headers, body }: Signed, url = RECEIVER_URL): Request {
  return new Request(url, { body, headers, method: "POST" });
}

async function answersInOrder<Item extends object>(
  handle: (item: Item) => Promise<Response>,
  items: readonly Item[],
): Promise<string[]> {
  const [first, ...rest] = items;
  if (!first) {
    return [];
  }
  const response = await handle(first);
  const text = await response.text();
  const later = await answersInOrder(handle, rest);
  return [`${String(response.status)} ${text}`, ...later];
}

interface MemoryStore {
  readonly nonces: Set<string>;
  readonly events: Map<string, MonitorEvent>;
  readonly store: DeliveryStore;
}

function memoryStore(): MemoryStore {
  const nonces = new Set<string>();
  const events = new Map<string, MonitorEvent>();
  const store: DeliveryStore = {
    async claimNonce(nonce): Promise<"new" | "replay"> {
      if (nonces.has(nonce)) {
        return await Promise.resolve("replay");
      }
      nonces.add(nonce);
      return await Promise.resolve("new");
    },
    async saveEvent(event): Promise<"new" | "duplicate"> {
      if (events.has(event.streamEventId)) {
        return await Promise.resolve("duplicate");
      }
      events.set(event.streamEventId, event);
      return await Promise.resolve("new");
    },
  };
  return { events, nonces, store };
}

interface Receiver {
  readonly deps: DeliveryDeps;
  readonly scheduled: MonitorEvent[];
}

function receiver(store: DeliveryStore, secrets: readonly string[] = [SECRET]): Receiver {
  const scheduled: MonitorEvent[] = [];
  const deps: DeliveryDeps = {
    after: (event) => {
      scheduled.push(event);
    },
    now: () => NOW,
    secrets,
    store,
  };
  return { deps, scheduled };
}

export {
  answersInOrder,
  memoryStore,
  NOW,
  post,
  randomNonce,
  receiver,
  RECEIVER_URL,
  sampleEvent,
  SECRET,
  sign,
  signDelivery,
  TEST_ALERT,
};
export type { MemoryStore, Receiver, SampleEvent, Signed };
