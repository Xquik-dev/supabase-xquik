import { z } from "zod";

const TOLERANCE_MS = 5 * 60 * 1000;
const encoder = new TextEncoder();
const EXTRACTABLE = false;

const monitorEvent = z.object({
  eventType: z.string().min(1),
  streamEventId: z.string().min(1),
  occurredAt: z.iso.datetime({ offset: true }),
  deliveryId: z.string().optional(),
  monitorId: z.string().optional(),
}).catchall(z.json());
export type MonitorEvent = z.infer<typeof monitorEvent>;

const deliveryBody = z.union([
  z.looseObject({ eventType: z.literal("webhook.test") }).transform(() => ({ kind: "test" as const })),
  monitorEvent.transform((event) => ({ kind: "event" as const, event })),
]);
export type Delivery = z.infer<typeof deliveryBody>;

export type Verdict =
  | { readonly ok: true; readonly nonce: string; readonly delivery: Delivery }
  | { readonly ok: false; readonly reason: "stale" | "signature" | "malformed" };

export type DeliveryStore = {
  claimNonce(nonce: string): Promise<"new" | "replay">;
  saveEvent(event: MonitorEvent): Promise<"new" | "duplicate">;
};

export type DeliveryDeps = {
  readonly secrets: readonly string[];
  readonly now: () => number;
  readonly store: DeliveryStore;
  readonly after: (event: MonitorEvent) => void;
};

export function parseSecrets(value: string | undefined): readonly string[] {
  const secrets = (value ?? "").split(",").map((secret) => secret.trim()).filter((secret) => secret !== "");
  if (secrets.length === 0) {
    throw new Error("Set XQUIK_WEBHOOK_SECRET to your webhook signing secret. Separate several secrets with commas.");
  }
  return secrets;
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) => parseInt(hex.slice(index * 2, index * 2 + 2), 16));
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
      { name: "HMAC", hash: "SHA-256" },
      EXTRACTABLE,
      ["verify"],
    );
    return await crypto.subtle.verify("HMAC", key, mac, message);
  }));
  return results.some((valid) => valid);
}

function signedMessage(timestamp: string, nonce: string, rawBody: Uint8Array): Uint8Array<ArrayBuffer> {
  const prefix = encoder.encode(`${timestamp}.${nonce}.`);
  const message = new Uint8Array(prefix.length + rawBody.length);
  message.set(prefix);
  message.set(rawBody, prefix.length);
  return message;
}

function parseBody(rawBody: Uint8Array): Delivery | undefined {
  try {
    return deliveryBody.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody))).data;
  } catch {
    return undefined;
  }
}

export async function verifyDelivery(
  { headers, rawBody }: { readonly headers: Headers; readonly rawBody: Uint8Array },
  secrets: readonly string[],
  nowMs: number,
): Promise<Verdict> {
  const timestamp = headers.get("x-xquik-timestamp") ?? "";
  if (!/^\d{1,16}$/.test(timestamp) || Math.abs(nowMs - Number(timestamp)) > TOLERANCE_MS) {
    return { ok: false, reason: "stale" };
  }
  const nonce = headers.get("x-xquik-nonce");
  const signature = /^sha256=([0-9a-f]{64})$/.exec(headers.get("x-xquik-signature") ?? "")?.[1];
  if (
    nonce === null || nonce === "" || signature === undefined ||
    !(await signedByAny(secrets, signature, signedMessage(timestamp, nonce, rawBody)))
  ) {
    return { ok: false, reason: "signature" };
  }
  const delivery = parseBody(rawBody);
  return delivery === undefined ? { ok: false, reason: "malformed" } : { ok: true, nonce, delivery };
}

const ANSWERS = {
  notPost: [405, "Send deliveries with POST."],
  stale: [401, "The timestamp is more than 5 minutes off."],
  signature: [401, "The signature does not match."],
  replay: [401, "This nonce was already used."],
  storeFailed: [503, "Could not store the delivery. Xquik will retry it."],
  malformed: [200, "Ignored a signed body that is not an Xquik event."],
  test: [200, "Received the test alert."],
  duplicate: [200, "Already stored this event."],
  stored: [200, "Stored the event."],
} as const satisfies Record<string, readonly [number, string]>;
type Outcome = keyof typeof ANSWERS;

async function decide(request: Request, deps: DeliveryDeps): Promise<Outcome> {
  if (request.method !== "POST") return "notPost";
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const verdict = await verifyDelivery({ headers: request.headers, rawBody }, deps.secrets, deps.now());
  if (!verdict.ok) return verdict.reason;
  try {
    if (await deps.store.claimNonce(verdict.nonce) === "replay") return "replay";
    if (verdict.delivery.kind === "test") return "test";
    if (await deps.store.saveEvent(verdict.delivery.event) === "duplicate") return "duplicate";
  } catch {
    return "storeFailed";
  }
  deps.after(verdict.delivery.event);
  return "stored";
}

export async function handleDelivery(request: Request, deps: DeliveryDeps): Promise<Response> {
  const outcome = await decide(request, deps);
  const [status, text] = ANSWERS[outcome];
  return new Response(text, { status, headers: outcome === "notPost" ? { allow: "POST" } : {} });
}
