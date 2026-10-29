import {
  array,
  assert,
  asyncProperty,
  date,
  integer,
  jsonValue,
  nat,
  oneof,
  option,
  pre,
  property,
  record,
  string,
  stringMatching,
} from "fast-check";
import { assertEquals, assertThrows } from "@std/assert";
import { NOW, SECRET, sign } from "./delivery.ts";
import { parseSecrets, verifyDelivery } from "@shared/webhook.ts";
import type { Arbitrary } from "fast-check";

const SEED = 20_261_028;
const FIVE_MINUTES_MS = 300_000;
const ONE_MS = 1;
const JUST_STALE_MS = FIVE_MINUTES_MS + ONE_MS;
const FAR_FUTURE_MS = 10_000_000_000_000;
const BYTE_VALUES = 256;
const NONE = 0;
const encoder = new TextEncoder();
const SAMPLE = {
  data: { id: "1893456789012345678", text: "Liftoff." },
  eventType: "tweet.new",
  monitorId: "10",
  occurredAt: "2026-02-24T14:22:00.000Z",
  streamEventId: "9001",
};

const secret = string({ minLength: 1, unit: "grapheme" });
const nonce = stringMatching(/^[!-~]{1,64}$/u);
const occurredAt = date({
  max: new Date("9999-12-31T00:00:00.000Z"),
  min: new Date("1970-01-01T00:00:00.000Z"),
  noInvalidDate: true,
}).map((moment) => moment.toISOString());
const event = record({
  data: record({ id: stringMatching(/^[1-9]\d{0,18}$/u), text: string({ unit: "grapheme" }) }),
  eventType: stringMatching(/^[a-z]{1,12}\.[a-z]{1,12}$/u).filter((type) => type !== "webhook.test"),
  monitorId: stringMatching(/^[1-9]\d{0,9}$/u),
  occurredAt,
  streamEventId: stringMatching(/^[1-9]\d{0,18}$/u),
});

interface Delivery {
  readonly headers: Headers;
  readonly rawBody: Uint8Array;
}

async function signed(key: string, body: string, timestamp: string, id: string): Promise<Delivery> {
  const headers = new Headers({
    "x-xquik-nonce": id,
    "x-xquik-signature": await sign(key, timestamp, id, body),
    "x-xquik-timestamp": timestamp,
  });
  return { headers, rawBody: encoder.encode(body) };
}

async function reason(delivery: Delivery, key: string): Promise<string> {
  const verdict = await verifyDelivery(delivery, [key], NOW);
  if (verdict.ok) {
    return "accepted";
  }
  return verdict.reason;
}

Deno.test("accepts every event signed with the secret within 5 minutes of the clock, with its nonce and fields", async () => {
  const skew = integer({ max: FIVE_MINUTES_MS, min: -FIVE_MINUTES_MS });
  await assert(
    asyncProperty(secret, nonce, event, skew, async (key, id, sent, offset) => {
      const delivery = await signed(key, JSON.stringify(sent), String(NOW + offset), id);
      assertEquals(await verifyDelivery(delivery, [key], NOW), {
        delivery: { event: sent, kind: "event" },
        nonce: id,
        ok: true,
      });
    }),
    {
      examples: [[SECRET, "nonce", SAMPLE, -FIVE_MINUTES_MS], [SECRET, "nonce", SAMPLE, FIVE_MINUTES_MS]],
      seed: SEED,
    },
  );
});

Deno.test("rejects every delivery whose body changed in any byte after signing", async () => {
  const change = record({ at: nat(), shift: integer({ max: 255, min: 1 }) });
  await assert(
    asyncProperty(secret, nonce, event, change, async (key, id, sent, { at, shift }) => {
      const delivery = await signed(key, JSON.stringify(sent), String(NOW), id);
      const index = at % delivery.rawBody.length;
      const rawBody = delivery.rawBody.map((byte, position) => {
        if (position === index) {
          return (byte + shift) % BYTE_VALUES;
        }
        return byte;
      });
      assertEquals(await reason({ headers: delivery.headers, rawBody }, key), "signature");
    }),
    { seed: SEED },
  );
});

type StaleCase = [string, string, typeof SAMPLE, string];

async function assertStale(timestamps: Arbitrary<string>, examples: readonly string[]): Promise<void> {
  const cases = examples.map((timestamp): StaleCase => [SECRET, "nonce", SAMPLE, timestamp]);
  await assert(
    asyncProperty(secret, nonce, event, timestamps, async (key, id, sent, timestamp) => {
      const verdict = await reason(await signed(key, JSON.stringify(sent), timestamp, id), key);
      assertEquals(verdict, "stale");
    }),
    { examples: cases, seed: SEED },
  );
}

Deno.test("rejects every signed delivery whose timestamp is more than 5 minutes from the clock", async () => {
  const skew = oneof(
    integer({ max: FAR_FUTURE_MS, min: JUST_STALE_MS }),
    integer({ max: -JUST_STALE_MS, min: -NOW }),
  );
  const timestamps = skew.map((offset) => String(NOW + offset));
  await assertStale(timestamps, [String(NOW + JUST_STALE_MS), String(NOW - JUST_STALE_MS)]);
});

Deno.test("rejects every signed delivery whose timestamp is not a whole number of milliseconds", async () => {
  const timestamps = stringMatching(/^[!-~]{0,20}$/u).filter((text) => !/^\d+$/u.test(text));
  await assertStale(timestamps, []);
});

Deno.test("ignores every signed JSON body that is not an Xquik event", async () => {
  const body = jsonValue().filter((value) =>
    typeof value !== "object" || value === null || Array.isArray(value) || !("eventType" in value)
  );
  await assert(
    asyncProperty(secret, nonce, body, async (key, id, value) => {
      const delivery = await signed(key, JSON.stringify(value), String(NOW), id);
      assertEquals(await reason(delivery, key), "malformed");
    }),
    { seed: SEED },
  );
});

Deno.test("reads every comma-separated secret without the blanks around it", () => {
  const blank = stringMatching(/^[ \t]{0,3}$/u);
  const text = stringMatching(/^[!-+\--~](?:[ !-+\--~]{0,30}[!-+\--~])?$/u);
  const entry = record({ after: blank, before: blank, value: option(text, { nil: "" }) });
  assert(
    property(array(entry, { maxLength: 8, minLength: 1 }), (entries) => {
      const expected = entries.map(({ value }) => value).filter((value) => value !== "");
      pre(expected.length > NONE);
      const header = entries.map(({ before, value, after }) => `${before}${value}${after}`).join(",");
      assertEquals(parseSecrets(header), expected);
    }),
    { seed: SEED },
  );
});

Deno.test("refuses every secret setting that is missing or holds only commas and blanks", () => {
  const setting = record({ value: stringMatching(/^[ \t,]{0,20}$/u) }, { requiredKeys: [] });
  assert(
    property(setting, ({ value }) => {
      assertThrows(() => parseSecrets(value), Error, "Set XQUIK_WEBHOOK_SECRET to your webhook signing secret.");
    }),
    { examples: [[{}], [{ value: "" }], [{ value: " , " }]], seed: SEED },
  );
});
