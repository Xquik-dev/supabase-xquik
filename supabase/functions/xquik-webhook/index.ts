import { handleDelivery, parseSecrets } from "@shared/webhook.ts";
import type { Database } from "@shared/database.types.ts";
import type { DeliveryStore } from "@shared/webhook.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withSupabase } from "@supabase/server";

const NONE = 0;
const UNIQUE_VIOLATION = "23505";

const secrets = parseSecrets(Deno.env.get("XQUIK_WEBHOOK_SECRET"));

function storeOf(supabase: SupabaseClient<Database>): DeliveryStore {
  return {
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
}

const xquikWebhook = {
  fetch: withSupabase<Database>(
    { auth: "none", cors: "disabled" },
    async (request, { supabaseAdmin }) =>
      await handleDelivery(request, { now: Date.now, secrets, store: storeOf(supabaseAdmin) }),
  ),
};

export default xquikWebhook;
