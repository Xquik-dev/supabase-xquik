import type { DeliveryDeps, DeliveryStore, MonitorEvent } from "@shared/webhook.ts";

const SECRET = "first-webhook-secret";
const NOW = Date.parse("2026-10-28T19:00:00.000Z");
const RECEIVER_URL = "http://localhost/functions/v1/xquik-webhook";
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;
const NONCE_BYTES = 16;

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

async function sign(secret: string, timestamp: string, nonce: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    EXTRACTABLE,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${nonce}.${body}`));
  return `sha256=${hex(new Uint8Array(mac))}`;
}

function randomNonce(): string {
  return hex(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
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
    "content-type": "application/json",
    "x-xquik-nonce": nonce,
    "x-xquik-signature": signature,
    "x-xquik-timestamp": timestamp,
  });
  return { body, headers, signature };
}

function post({ headers, body }: Signed, url = RECEIVER_URL): Request {
  return new Request(url, { body, headers, method: "POST" });
}

async function statusesInOrder(
  handle: (request: Request) => Promise<Response>,
  requests: readonly Request[],
): Promise<number[]> {
  const [first, ...rest] = requests;
  if (!first) {
    return [];
  }
  const response = await handle(first);
  const later = await statusesInOrder(handle, rest);
  return [response.status, ...later];
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
  statusesInOrder,
  TEST_ALERT,
};
export type { MemoryStore, Receiver, SampleEvent, Signed };
