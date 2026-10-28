import { assertEquals, assertRejects } from "@std/assert";
import { askDocs, createXquik, getSportsGameView } from "../supabase/functions/_shared/xquik.ts";

function answering(status: number, body: unknown): typeof fetch {
  return async () => await Promise.resolve(Response.json(body, { status }));
}

const INPUT = { query: "How do I monitor NASA?" };

Deno.test("askDocs raises the HTTP status with Xquik's error message, or with the status alone", async () => {
  const failures = [
    { fetch: answering(429, { error: { message: "Slow down." } }) },
    { method: "POST", fetch: answering(502, "Bad gateway") },
  ] as const;
  const messages = await Promise.all(
    failures.map(async (options) => (await assertRejects(async () => await askDocs(INPUT, options), Error)).message),
  );
  assertEquals(messages, ["Xquik docs search returned HTTP 429. Slow down.", "Xquik docs search returned HTTP 502."]);
});

Deno.test("askDocs returns the text content of an answer", async () => {
  const body = { _meta: {}, content: [{ type: "text" as const, text: "Create a monitor for @NASA." }] };
  assertEquals(await askDocs(INPUT, { fetch: answering(200, body) }), body);
});

Deno.test("createXquik sends XQUIK_API_KEY in the x-api-key header", async () => {
  const outer = Deno.env.get("XQUIK_API_KEY");
  Deno.env.set("XQUIK_API_KEY", "xq_test_key");
  const keys: (string | null)[] = [];
  try {
    const client = createXquik({
      fetch: async (input, init) => {
        keys.push(new Request(input, init).headers.get("x-api-key"));
        return await Promise.resolve(Response.json({}));
      },
    });
    await getSportsGameView(client, "roster", "nfl", "401");
  } finally {
    if (outer === undefined) Deno.env.delete("XQUIK_API_KEY");
    else Deno.env.set("XQUIK_API_KEY", outer);
  }
  assertEquals(keys, ["xq_test_key"]);
});
