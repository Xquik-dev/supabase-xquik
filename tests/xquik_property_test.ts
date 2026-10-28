import { assertEquals, assertRejects } from "@std/assert";
import * as fc from "fast-check";
import { askDocs, type AskDocsInput } from "../supabase/functions/_shared/xquik.ts";
import { identifier, literal } from "../scripts/sql.ts";

const SEED = 20261028;
const LISTS = ["results", "content", "structuredData"];

const key = fc.stringMatching(/^[a-z][a-zA-Z_]{0,11}$/).filter((name) => !LISTS.includes(name));
const scalar = fc.oneof(fc.string({ unit: "grapheme" }), fc.integer(), fc.boolean(), fc.constant(null));
const fields = fc.dictionary(key, scalar);
const quotable = fc.oneof(
  fc.string({ unit: "binary" }),
  fc.string({ unit: fc.constantFrom("'", '"', "\\", " ", "a") }),
);
const input: fc.Arbitrary<AskDocsInput> = fc.record({
  query: fc.oneof(
    fc.string({ unit: "grapheme" }),
    fc.string({ unit: fc.constantFrom(" ", "&", "=", "+", "%", "#", "?", "/", "a") }),
  ),
  site: fc.constantFrom("docs.xquik.com", "xquik.com"),
  mode: fc.constant("list"),
  "response_format": fc.constantFrom("chatgpt_app", "conversational_search"),
}, { requiredKeys: ["query"] });

function answering(status: number, body: unknown, seen: URL[] = []): typeof fetch {
  return async (url, init) => {
    seen.push(new URL(new Request(url, init).url));
    return await Promise.resolve(Response.json(body, { status }));
  };
}

function unquoted(quoted: string, quote: string): string | undefined {
  const inner = quoted.startsWith(quote) && quoted.endsWith(quote) ? quoted.slice(1, -1) : undefined;
  return inner?.split(quote.repeat(2)).some((part) => part.includes(quote)) === false
    ? inner.replaceAll(quote.repeat(2), quote)
    : undefined;
}

Deno.test("askDocs sends every input field as its own query parameter of a GET", async () => {
  await fc.assert(
    fc.asyncProperty(input, async (asked) => {
      const seen: URL[] = [];
      await askDocs(asked, { fetch: answering(200, { _meta: {} }, seen) });
      assertEquals(seen.map((url) => [url.origin + url.pathname, Object.fromEntries(url.searchParams)]), [
        ["https://xquik.com/ask", { ...asked }],
      ]);
    }),
    { seed: SEED },
  );
});

Deno.test("askDocs sends every input as the JSON body of a POST with no query", async () => {
  await fc.assert(
    fc.asyncProperty(input, async (asked) => {
      const sent: Request[] = [];
      const fetch: typeof globalThis.fetch = async (url, init) => {
        sent.push(new Request(url, init));
        return await Promise.resolve(Response.json({ _meta: {} }));
      };
      await askDocs(asked, { method: "POST", fetch });
      const [request = new Request("https://unsent.invalid")] = sent;
      const body: unknown = await request.json();
      assertEquals([sent.length, request.method, request.url, request.headers.get("content-type"), body], [
        1,
        "POST",
        "https://xquik.com/ask",
        "application/json",
        { ...asked },
      ]);
    }),
    { seed: SEED },
  );
});

Deno.test("askDocs returns every answer that carries its _meta object, with every other field", async () => {
  await fc.assert(
    fc.asyncProperty(fields, fields, async (meta, rest) => {
      const body = { ...rest, _meta: meta };
      assertEquals(await askDocs({ query: "q" }, { fetch: answering(200, body) }), body);
    }),
    { seed: SEED },
  );
});

Deno.test("askDocs rejects every answer without its _meta object", async () => {
  await fc.assert(
    fc.asyncProperty(fields, async (body) => {
      await assertRejects(async () => await askDocs({ query: "q" }, { fetch: answering(200, body) }), Error, "_meta");
    }),
    { seed: SEED },
  );
});

Deno.test("literal quotes every string so a SQL reader gets the same string back", () => {
  fc.assert(
    fc.property(quotable, (text) => {
      assertEquals(unquoted(literal(text), "'"), text);
    }),
    { seed: SEED },
  );
});

Deno.test("identifier quotes every name so a SQL reader gets the same name back", () => {
  fc.assert(
    fc.property(quotable, (name) => {
      assertEquals(unquoted(identifier(name), '"'), name);
    }),
    { seed: SEED },
  );
});
