import { assertEquals, assertThrows } from "@std/assert";
import fc from "fast-check";
import { parseSecrets, verifyDelivery } from "../supabase/functions/_shared/webhook.ts";
import { SECRET, sign } from "./delivery.ts";

const SEED = 20261028;
const NOW = Date.UTC(2026, 9, 28, 19, 0, 0);
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const HEX = "0123456789abcdef";
const encoder = new TextEncoder();
const SAMPLE = {
  eventType: "tweet.new",
  streamEventId: "9001",
  occurredAt: "2026-02-24T14:22:00.000Z",
  monitorId: "10",
  data: { id: "1893456789012345678", text: "Liftoff." },
};

const secret = fc.string({ minLength: 1, unit: "grapheme" });
const nonce = fc.stringMatching(/^[!-~]{1,64}$/);
const event = fc.record({
  eventType: fc.stringMatching(/^[a-z]{1,12}\.[a-z]{1,12}$/).filter((type) => type !== "webhook.test"),
  streamEventId: fc.stringMatching(/^[1-9]\d{0,18}$/),
  occurredAt: fc.date({ min: new Date(0), max: new Date(Date.UTC(9999, 11, 31)), noInvalidDate: true })
    .map((date) => date.toISOString()),
  monitorId: fc.stringMatching(/^[1-9]\d{0,9}$/),
  data: fc.record({ id: fc.stringMatching(/^[1-9]\d{0,18}$/), text: fc.string({ unit: "grapheme" }) }),
});

type Delivery = { readonly headers: Headers; readonly rawBody: Uint8Array };

async function signed(key: string, body: string, timestamp: string, id: string): Promise<Delivery> {
  const headers = new Headers({
    "x-xquik-timestamp": timestamp,
    "x-xquik-nonce": id,
    "x-xquik-signature": await sign(key, timestamp, id, body),
  });
  return { headers, rawBody: encoder.encode(body) };
}

async function reason(delivery: Delivery, key: string): Promise<string> {
  const verdict = await verifyDelivery(delivery, [key], NOW);
  return verdict.ok ? "accepted" : verdict.reason;
}

Deno.test("accepts every event signed with the secret within 5 minutes of the clock, with its nonce and fields", async () => {
  const skew = fc.integer({ min: -FIVE_MINUTES_MS, max: FIVE_MINUTES_MS });
  await fc.assert(
    fc.asyncProperty(secret, nonce, event, skew, async (key, id, sent, offset) => {
      const delivery = await signed(key, JSON.stringify(sent), String(NOW + offset), id);
      assertEquals(await verifyDelivery(delivery, [key], NOW), {
        ok: true,
        nonce: id,
        delivery: { kind: "event", event: sent },
      });
    }),
    {
      seed: SEED,
      examples: [[SECRET, "nonce", SAMPLE, -FIVE_MINUTES_MS], [SECRET, "nonce", SAMPLE, FIVE_MINUTES_MS]],
    },
  );
});

Deno.test("rejects every delivery whose body changed in any byte after signing", async () => {
  const change = fc.record({ at: fc.nat(), flip: fc.integer({ min: 1, max: 255 }) });
  await fc.assert(
    fc.asyncProperty(secret, nonce, event, change, async (key, id, sent, { at, flip }) => {
      const delivery = await signed(key, JSON.stringify(sent), String(NOW), id);
      const index = at % delivery.rawBody.length;
      const rawBody = delivery.rawBody.map((byte, position) => position === index ? byte ^ flip : byte);
      assertEquals(await reason({ headers: delivery.headers, rawBody }, key), "signature");
    }),
    { seed: SEED },
  );
});

Deno.test("rejects every signature with any hex digit changed", async () => {
  const change = fc.record({ at: fc.nat({ max: 63 }), shift: fc.integer({ min: 1, max: 15 }) });
  await fc.assert(
    fc.asyncProperty(secret, nonce, event, change, async (key, id, sent, { at, shift }) => {
      const delivery = await signed(key, JSON.stringify(sent), String(NOW), id);
      const hex = (delivery.headers.get("x-xquik-signature") ?? "").slice("sha256=".length);
      const digit = HEX[(HEX.indexOf(hex.charAt(at)) + shift) % HEX.length] ?? "";
      delivery.headers.set("x-xquik-signature", `sha256=${hex.slice(0, at)}${digit}${hex.slice(at + 1)}`);
      assertEquals(await reason(delivery, key), "signature");
    }),
    { seed: SEED },
  );
});

Deno.test("rejects every signed delivery whose timestamp is more than 5 minutes from the clock", async () => {
  const skew = fc.oneof(
    fc.integer({ min: FIVE_MINUTES_MS + 1, max: 10 ** 13 }),
    fc.integer({ min: -NOW, max: -FIVE_MINUTES_MS - 1 }),
  );
  await fc.assert(
    fc.asyncProperty(secret, nonce, event, skew, async (key, id, sent, offset) => {
      assertEquals(await reason(await signed(key, JSON.stringify(sent), String(NOW + offset), id), key), "stale");
    }),
    {
      seed: SEED,
      examples: [[SECRET, "nonce", SAMPLE, FIVE_MINUTES_MS + 1], [SECRET, "nonce", SAMPLE, -FIVE_MINUTES_MS - 1]],
    },
  );
});

Deno.test("rejects every signed delivery whose timestamp is not a whole number of milliseconds", async () => {
  const timestamp = fc.stringMatching(/^[!-~]{0,20}$/).filter((text) => !/^\d+$/.test(text));
  await fc.assert(
    fc.asyncProperty(secret, nonce, event, timestamp, async (key, id, sent, text) => {
      assertEquals(await reason(await signed(key, JSON.stringify(sent), text, id), key), "stale");
    }),
    { seed: SEED },
  );
});

Deno.test("ignores every signed JSON body that is not an Xquik event", async () => {
  const body = fc.jsonValue().filter((value) =>
    typeof value !== "object" || value === null || Array.isArray(value) || !("eventType" in value)
  );
  await fc.assert(
    fc.asyncProperty(secret, nonce, body, async (key, id, value) => {
      assertEquals(await reason(await signed(key, JSON.stringify(value), String(NOW), id), key), "malformed");
    }),
    { seed: SEED },
  );
});

Deno.test("reads every comma-separated secret without the blanks around it", () => {
  const blank = fc.stringMatching(/^[ \t]{0,3}$/);
  const text = fc.stringMatching(/^[!-+\--~](?:[ !-+\--~]{0,30}[!-+\--~])?$/);
  const entry = fc.record({ before: blank, value: fc.option(text, { nil: "" }), after: blank });
  fc.assert(
    fc.property(fc.array(entry, { minLength: 1, maxLength: 8 }), (entries) => {
      const expected = entries.map(({ value }) => value).filter((value) => value !== "");
      fc.pre(expected.length > 0);
      const value = entries.map(({ before, value, after }) => `${before}${value}${after}`).join(",");
      assertEquals(parseSecrets(value), expected);
    }),
    { seed: SEED },
  );
});

Deno.test("refuses every secret setting that is missing or holds only commas and blanks", () => {
  fc.assert(
    fc.property(fc.option(fc.stringMatching(/^[ \t,]{0,20}$/), { nil: undefined }), (value) => {
      assertThrows(() => parseSecrets(value), Error, "Set XQUIK_WEBHOOK_SECRET to your webhook signing secret.");
    }),
    { seed: SEED, examples: [[undefined], [""], [" , "]] },
  );
});
