import parseJson from "./json.ts";
import { z } from "zod";

const TOLERANCE_MS = 300_000;
const MIN_ID_LENGTH = 1;
const NONE = 0;
const HEX_RADIX = 16;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_SERVICE_UNAVAILABLE = 503;
const SIGNATURE_PREFIX = "sha256=";
const SIGNATURE = /^sha256=[0-9a-f]{64}$/u;
const TIMESTAMP = /^\d{1,16}$/u;
const HEX_PAIR = /[0-9a-f]{2}/gu;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const EXTRACTABLE = false;

const monitorEvent = z.object({
  deliveryId: z.string().optional(),
  eventType: z.string().min(MIN_ID_LENGTH),
  monitorId: z.string().optional(),
  occurredAt: z.iso.datetime({ offset: true }),
  streamEventId: z.string().min(MIN_ID_LENGTH),
}).catchall(z.json());
type MonitorEvent = z.infer<typeof monitorEvent>;

const deliveryBody = z.union([
  z.looseObject({ eventType: z.literal("webhook.test") }).transform(() => ({ kind: "test" as const })),
  monitorEvent.transform((event) => ({ event, kind: "event" as const })),
]);
type Delivery = z.infer<typeof deliveryBody>;

type Verdict =
  | { readonly ok: true; readonly nonce: string; readonly delivery: Delivery }
  | { readonly ok: false; readonly reason: "stale" | "signature" | "malformed" };
type Accepted = Extract<Verdict, { ok: true }>;

interface DeliveryStore {
  claimNonce: (nonce: string) => Promise<"new" | "replay">;
  saveEvent: (event: MonitorEvent) => Promise<"new" | "duplicate">;
}

interface DeliveryDeps {
  readonly secrets: readonly string[];
  readonly now: () => number;
  readonly store: DeliveryStore;
  readonly after?: (event: MonitorEvent) => void;
}

interface SignedParts {
  readonly mac: string;
  readonly nonce: string;
  readonly rawBody: Uint8Array;
  readonly timestamp: string;
}

function parseSecrets(value: string | undefined): readonly string[] {
  const secrets = (value ?? "").split(",").map((secret) => secret.trim()).filter((secret) => secret !== "");
  if (secrets.length === NONE) {
    throw new Error("Set XQUIK_WEBHOOK_SECRET to your webhook signing secret. Separate several secrets with commas.");
  }
  return secrets;
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.matchAll(HEX_PAIR), (pair) => Number.parseInt(pair[0], HEX_RADIX));
}

async function signedByAny(
  secrets: readonly string[],
  signature: string,
  message: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  const mac = hexBytes(signature);
  const results = await Promise.all(secrets.map(async (secret) => {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { hash: "SHA-256", name: "HMAC" },
      EXTRACTABLE,
      ["verify"],
    );
    return await crypto.subtle.verify("HMAC", key, mac, message);
  }));
  return results.some(Boolean);
}

function decodeJson(rawBody: Uint8Array): unknown {
  try {
    return parseJson(decoder.decode(rawBody));
  } catch {
    return null;
  }
}

function isStale(timestamp: string, nowMs: number): boolean {
  return !TIMESTAMP.test(timestamp) || Math.abs(nowMs - Number(timestamp)) > TOLERANCE_MS;
}

function signedMessage({ nonce, rawBody, timestamp }: SignedParts): Uint8Array<ArrayBuffer> {
  const prefix = encoder.encode(`${timestamp}.${nonce}.`);
  const message = new Uint8Array(prefix.length + rawBody.length);
  message.set(prefix);
  message.set(rawBody, prefix.length);
  return message;
}

function signedParts(headers: Headers, rawBody: Uint8Array, timestamp: string): SignedParts | null {
  const nonce = headers.get("x-xquik-nonce");
  const signature = headers.get("x-xquik-signature");
  if (nonce === null || nonce === "" || signature === null || !SIGNATURE.test(signature)) {
    return null;
  }
  return { mac: signature.slice(SIGNATURE_PREFIX.length), nonce, rawBody, timestamp };
}

async function verifyDelivery(
  { headers, rawBody }: { readonly headers: Headers; readonly rawBody: Uint8Array },
  secrets: readonly string[],
  nowMs: number,
): Promise<Verdict> {
  const timestamp = headers.get("x-xquik-timestamp");
  if (timestamp === null || isStale(timestamp, nowMs)) {
    return { ok: false, reason: "stale" };
  }
  const parts = signedParts(headers, rawBody, timestamp);
  if (!parts || !(await signedByAny(secrets, parts.mac, signedMessage(parts)))) {
    return { ok: false, reason: "signature" };
  }
  const parsed = deliveryBody.safeParse(decodeJson(rawBody));
  if (!parsed.success) {
    return { ok: false, reason: "malformed" };
  }
  return { delivery: parsed.data, nonce: parts.nonce, ok: true };
}

const ANSWERS = {
  duplicate: [HTTP_OK, "Already stored this event."],
  malformed: [HTTP_OK, "Ignored a signed body that is not an Xquik event."],
  notPost: [HTTP_METHOD_NOT_ALLOWED, "Send deliveries with POST."],
  replay: [HTTP_UNAUTHORIZED, "This nonce was already used."],
  signature: [HTTP_UNAUTHORIZED, "The signature does not match."],
  stale: [HTTP_UNAUTHORIZED, "The timestamp is more than 5 minutes off."],
  storeFailed: [HTTP_SERVICE_UNAVAILABLE, "Could not store the delivery. Xquik will retry it."],
  stored: [HTTP_OK, "Stored the event."],
  test: [HTTP_OK, "Received the test alert."],
} as const satisfies Record<string, readonly [number, string]>;
type Outcome = keyof typeof ANSWERS;

async function record({ delivery, nonce }: Accepted, deps: DeliveryDeps): Promise<Outcome> {
  try {
    if (await deps.store.claimNonce(nonce) === "replay") {
      return "replay";
    }
    if (delivery.kind === "test") {
      return "test";
    }
    if (await deps.store.saveEvent(delivery.event) === "duplicate") {
      return "duplicate";
    }
  } catch {
    return "storeFailed";
  }
  deps.after?.(delivery.event);
  return "stored";
}

async function decide(request: Request, deps: DeliveryDeps): Promise<Outcome> {
  if (request.method !== "POST") {
    return "notPost";
  }
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const verdict = await verifyDelivery({ headers: request.headers, rawBody }, deps.secrets, deps.now());
  if (!verdict.ok) {
    return verdict.reason;
  }
  return await record(verdict, deps);
}

async function handleDelivery(request: Request, deps: DeliveryDeps): Promise<Response> {
  const outcome = await decide(request, deps);
  const [status, text] = ANSWERS[outcome];
  const response = new Response(text, { status });
  if (outcome === "notPost") {
    response.headers.set("allow", "POST");
  }
  return response;
}

export { handleDelivery, parseSecrets, verifyDelivery };
export type { Delivery, DeliveryDeps, DeliveryStore, MonitorEvent, Verdict };
