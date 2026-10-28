import { handleDelivery, parseSecrets } from "@shared/webhook.ts";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/database.types.ts";
import type { DeliveryStore } from "@shared/webhook.ts";

const NONE = 0;
const UNIQUE_VIOLATION = "23505";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (typeof value !== "string" || value === "") {
    throw new Error(`Set ${name} for the xquik-webhook function.`);
  }
  return value;
}

const secrets = parseSecrets(Deno.env.get("XQUIK_WEBHOOK_SECRET"));
const supabase = createClient<Database>(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

const store: DeliveryStore = {
  async claimNonce(nonce): Promise<"new" | "replay"> {
    const { error } = await supabase.from("xquik_webhook_nonces").insert({ nonce });
    if (error === null) {
      return "new";
    }
    if (error.code === UNIQUE_VIOLATION) {
      return "replay";
    }
    throw new Error(error.message);
  },
  async saveEvent(event): Promise<"new" | "duplicate"> {
    const { data, error } = await supabase
      .from("xquik_events")
      .upsert({
        delivery_id: event.deliveryId ?? null,
        event_type: event.eventType,
        monitor_id: event.monitorId ?? null,
        occurred_at: event.occurredAt,
        payload: event,
        stream_event_id: event.streamEventId,
      }, { ignoreDuplicates: true, onConflict: "stream_event_id" })
      .select("stream_event_id");
    if (error !== null) {
      throw new Error(error.message);
    }
    if (data.length === NONE) {
      return "duplicate";
    }
    return "new";
  },
};

Deno.serve(async (request) => await handleDelivery(request, { now: Date.now, secrets, store }));
