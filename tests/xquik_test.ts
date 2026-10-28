import { askDocs } from "@shared/xquik.ts";
import { assertRejects } from "@std/assert";

const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_BAD_GATEWAY = 502;

function answering(status: number, body: unknown): typeof fetch {
  return async () => await Promise.resolve(Response.json(body, { status }));
}

Deno.test("askDocs raises the HTTP status with Xquik's error message, or with the status alone", async () => {
  const input = { query: "How do I monitor NASA?" };
  await assertRejects(
    async () =>
      await askDocs(input, { fetch: answering(HTTP_TOO_MANY_REQUESTS, { error: { message: "Slow down." } }) }),
    Error,
    "Xquik docs search returned HTTP 429. Slow down.",
  );
  await assertRejects(
    async () => await askDocs(input, { fetch: answering(HTTP_BAD_GATEWAY, "Bad gateway"), method: "POST" }),
    Error,
    "Xquik docs search returned HTTP 502.",
  );
});
