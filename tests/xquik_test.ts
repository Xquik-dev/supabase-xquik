import { assertRejects } from "@std/assert";
import { askDocs } from "../supabase/functions/_shared/xquik.ts";

function answering(status: number, body: unknown): typeof fetch {
  return () => Promise.resolve(Response.json(body, { status }));
}

Deno.test("askDocs raises the HTTP status with Xquik's error message, or with the status alone", async () => {
  const input = { query: "How do I monitor NASA?" };
  await assertRejects(
    () => askDocs(input, { fetch: answering(429, { error: { message: "Slow down." } }) }),
    Error,
    "Xquik docs search returned HTTP 429. Slow down.",
  );
  await assertRejects(
    () => askDocs(input, { method: "POST", fetch: answering(502, "Bad gateway") }),
    Error,
    "Xquik docs search returned HTTP 502.",
  );
});
