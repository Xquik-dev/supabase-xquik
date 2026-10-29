import { askDocs, createXquik, getSportsGameView } from "@shared/xquik.ts";
import { assertEquals, assertRejects } from "@std/assert";

const HTTP_OK = 200;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_BAD_GATEWAY = 502;
const INPUT = { query: "How do I monitor NASA?" };

function answering(status: number, body: unknown): typeof fetch {
  return async () => await Promise.resolve(Response.json(body, { status }));
}

Deno.test("askDocs raises the HTTP status with Xquik's error message, or with the status alone", async () => {
  const failures = [
    { fetch: answering(HTTP_TOO_MANY_REQUESTS, { error: { message: "Slow down." } }) },
    { fetch: answering(HTTP_BAD_GATEWAY, "Bad gateway"), method: "POST" },
  ] as const;
  const errors = await Promise.all(
    failures.map(async (options) => await assertRejects(async () => await askDocs(INPUT, options), Error)),
  );
  assertEquals(errors.map(({ message }) => message), [
    "Xquik docs search returned HTTP 429. Slow down.",
    "Xquik docs search returned HTTP 502.",
  ]);
});

Deno.test("askDocs returns the text content of an answer", async () => {
  const body = { _meta: {}, content: [{ text: "Create a monitor for @NASA.", type: "text" as const }] };
  assertEquals(await askDocs(INPUT, { fetch: answering(HTTP_OK, body) }), body);
});

Deno.test("createXquik sends XQUIK_API_KEY in the x-api-key header", async () => {
  const outer = Deno.env.get("XQUIK_API_KEY");
  Deno.env.set("XQUIK_API_KEY", "xq_test_key");
  const keys: Array<string | null> = [];
  try {
    const client = createXquik({
      fetch: async (input, init) => {
        keys.push(new Request(input, init).headers.get("x-api-key"));
        return await Promise.resolve(Response.json({}));
      },
    });
    await getSportsGameView(client, { id: "401", league: "nfl", view: "roster" });
  } finally {
    Deno.env.delete("XQUIK_API_KEY");
    if (typeof outer === "string") {
      Deno.env.set("XQUIK_API_KEY", outer);
    }
  }
  assertEquals(keys, ["xq_test_key"]);
});
