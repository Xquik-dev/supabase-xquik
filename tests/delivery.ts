import type { DeliveryDeps, DeliveryStore, MonitorEvent } from "../supabase/functions/_shared/webhook.ts";

export const SECRET = "first-webhook-secret";
export const NOW = Date.UTC(2026, 9, 28, 19, 0, 0);
export const RECEIVER_URL = "http://localhost/functions/v1/xquik-webhook";

const encoder = new TextEncoder();
const EXTRACTABLE = false;

export type SampleEvent = {
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
};

export function sampleEvent(
  eventType: string,
  ids: { streamEventId?: string; deliveryId?: string } = {},
): SampleEvent {
  return {
    eventType,
    schemaVersion: 1,
    deliveryId: ids.deliveryId ?? "502",
    streamEventId: ids.streamEventId ?? "9001",
    occurredAt: "2026-02-24T14:22:00.000Z",
    monitorId: "10",
    monitorType: "account",
    username: "NASA",
    xUserId: "11348282",
    data: { id: "1893456789012345678", text: "Liftoff." },
  };
}

export const TEST_ALERT = {
  data: { message: "Test delivery from Xquik" },
  eventType: "webhook.test",
  timestamp: "2026-10-28T19:00:00.000Z",
};

export async function sign(secret: string, timestamp: string, nonce: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    EXTRACTABLE,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${nonce}.${body}`));
  return `sha256=${Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type Signed = { readonly headers: Headers; readonly body: string; readonly signature: string };

export async function signDelivery(
  body: string,
  { secret = SECRET, timestamp = String(NOW), nonce = randomNonce() } = {},
): Promise<Signed> {
  const signature = await sign(secret, timestamp, nonce, body);
  const headers = new Headers({
    "content-type": "application/json",
    "x-xquik-timestamp": timestamp,
    "x-xquik-nonce": nonce,
    "x-xquik-signature": signature,
  });
  return { headers, body, signature };
}

export function post({ headers, body }: Signed, url = RECEIVER_URL): Request {
  return new Request(url, { method: "POST", headers, body });
}

export type MemoryStore = {
  readonly nonces: Set<string>;
  readonly events: Map<string, MonitorEvent>;
  readonly store: DeliveryStore;
};

export function memoryStore(): MemoryStore {
  const nonces = new Set<string>();
  const events = new Map<string, MonitorEvent>();
  const store: DeliveryStore = {
    async claimNonce(nonce): Promise<"new" | "replay"> {
      if (nonces.has(nonce)) return await Promise.resolve("replay");
      nonces.add(nonce);
      return await Promise.resolve("new");
    },
    async saveEvent(event): Promise<"new" | "duplicate"> {
      if (events.has(event.streamEventId)) return await Promise.resolve("duplicate");
      events.set(event.streamEventId, event);
      return await Promise.resolve("new");
    },
  };
  return { nonces, events, store };
}

export type Receiver = { readonly deps: DeliveryDeps; readonly scheduled: MonitorEvent[] };

export function receiver(store: DeliveryStore, secrets: readonly string[] = [SECRET]): Receiver {
  const scheduled: MonitorEvent[] = [];
  const deps: DeliveryDeps = {
    secrets,
    now: () => NOW,
    store,
    after: (event) => {
      scheduled.push(event);
    },
  };
  return { deps, scheduled };
}
