import { createClient } from "@supabase/supabase-js";
import { type DeliveryStore, handleDelivery, type MonitorEvent, parseSecrets } from "../_shared/webhook.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

type Table<Row, Insert> = { Row: Row; Insert: Insert; Update: Partial<Insert>; Relationships: [] };
type EventRow = {
  "stream_event_id": string;
  "delivery_id": string | null;
  "event_type": string;
  "monitor_id": string | null;
  "occurred_at": string;
  payload: unknown;
};
type Database = {
  public: {
    Tables: {
      "xquik_webhook_nonces": Table<{ nonce: string; "seen_at": string }, { nonce: string; "seen_at"?: string }>;
      "xquik_events": Table<EventRow & { "received_at": string }, EventRow & { "received_at"?: string }>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value === "") throw new Error(`Set ${name} for the xquik-webhook function.`);
  return value;
}

const secrets = parseSecrets(Deno.env.get("XQUIK_WEBHOOK_SECRET"));
const supabase = createClient<Database>(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

function storeError(step: string, message: string): Error {
  console.error(`xquik-webhook could not ${step}. ${message}`);
  return new Error(message);
}

const store: DeliveryStore = {
  async claimNonce(nonce): Promise<"new" | "replay"> {
    const { error } = await supabase.from("xquik_webhook_nonces").insert({ nonce });
    if (error === null) return "new";
    if (error.code === "23505") return "replay";
    throw storeError("record the nonce", error.message);
  },
  async saveEvent(event): Promise<"new" | "duplicate"> {
    const { data, error } = await supabase
      .from("xquik_events")
      .upsert({
        stream_event_id: event.streamEventId,
        delivery_id: event.deliveryId ?? null,
        event_type: event.eventType,
        monitor_id: event.monitorId ?? null,
        occurred_at: event.occurredAt,
        payload: event,
      }, { onConflict: "stream_event_id", ignoreDuplicates: true })
      .select("stream_event_id");
    if (error !== null) throw storeError("store the event", error.message);
    return data.length > 0 ? "new" : "duplicate";
  },
};

function onEvent(event: MonitorEvent): Promise<void> {
  console.log(`xquik-webhook stored ${event.eventType} event ${event.streamEventId}.`);
  return Promise.resolve();
}

Deno.serve((request) =>
  handleDelivery(request, {
    secrets,
    now: Date.now,
    store,
    after: (event) => EdgeRuntime.waitUntil(onEvent(event)),
  })
);
