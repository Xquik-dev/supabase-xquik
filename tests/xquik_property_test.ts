import {
  assert,
  asyncProperty,
  boolean,
  constant,
  constantFrom,
  dictionary,
  integer,
  oneof,
  property,
  record,
  string,
  stringMatching,
} from "fast-check";
import { assertEquals, assertRejects } from "@std/assert";
import { identifier, literal } from "@/scripts/sql.ts";
import type { Arbitrary } from "fast-check";
import { askDocs } from "@shared/xquik.ts";
import type { AskDocsInput } from "@shared/xquik.ts";
import parseJson from "@shared/json.ts";

const SEED = 20_261_028;
const HTTP_OK = 200;
const SENT_ONCE = 1;
const LISTS = new Set(["results", "content", "structuredData"]);

const key = stringMatching(/^[a-z][a-zA-Z_]{0,11}$/u).filter((name) => !LISTS.has(name));
const scalar = oneof(string({ unit: "grapheme" }), integer(), boolean(), constant(null));
const fields = dictionary(key, scalar);
const quotable = oneof(
  string({ unit: "binary" }),
  string({ unit: constantFrom("'", '"', "\\", " ", "a") }),
);
const query = oneof(
  string({ unit: "grapheme" }),
  string({ unit: constantFrom(" ", "&", "=", "+", "%", "#", "?", "/", "a") }),
);
const input: Arbitrary<AskDocsInput> = record({
  mode: constant("list"),
  query,
  "response_format": constantFrom("chatgpt_app", "conversational_search"),
  site: constantFrom("docs.xquik.com", "xquik.com"),
}, { requiredKeys: ["query"] });

function answering(status: number, body: unknown, seen: URL[] = []): typeof fetch {
  return async (url, init) => {
    seen.push(new URL(new Request(url, init).url));
    return await Promise.resolve(Response.json(body, { status }));
  };
}

function unquoted(quoted: string, quote: string): string | null {
  if (!quoted.startsWith(quote) || !quoted.endsWith(quote)) {
    return null;
  }
  const doubled = `${quote}${quote}`;
  const inner = quoted.slice(quote.length, -quote.length);
  if (inner.split(doubled).some((part) => part.includes(quote))) {
    return null;
  }
  return inner.replaceAll(doubled, quote);
}

Deno.test("askDocs sends every input field as its own query parameter of a GET", async () => {
  await assert(
    asyncProperty(input, async (asked) => {
      const seen: URL[] = [];
      await askDocs(asked, { fetch: answering(HTTP_OK, { _meta: {} }, seen) });
      assertEquals(seen.map((url) => [url.origin + url.pathname, Object.fromEntries(url.searchParams)]), [
        ["https://xquik.com/ask", { ...asked }],
      ]);
    }),
    { seed: SEED },
  );
});

Deno.test("askDocs sends every input as the JSON body of a POST with no query", async () => {
  await assert(
    asyncProperty(input, async (asked) => {
      const sent: Request[] = [];
      const fetch: typeof globalThis.fetch = async (url, init) => {
        sent.push(new Request(url, init));
        return await Promise.resolve(Response.json({ _meta: {} }));
      };
      await askDocs(asked, { fetch, method: "POST" });
      const [request = new Request("https://unsent.invalid")] = sent;
      const body: unknown = parseJson(await request.text());
      assertEquals([sent.length, request.method, request.url, request.headers.get("content-type"), body], [
        SENT_ONCE,
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
  await assert(
    asyncProperty(fields, fields, async (meta, rest) => {
      const body = { ...rest, _meta: meta };
      assertEquals(await askDocs({ query: "q" }, { fetch: answering(HTTP_OK, body) }), body);
    }),
    { seed: SEED },
  );
});

Deno.test("askDocs rejects every answer without its _meta object", async () => {
  await assert(
    asyncProperty(fields, async (body) => {
      await assertRejects(
        async () => await askDocs({ query: "q" }, { fetch: answering(HTTP_OK, body) }),
        Error,
        "_meta",
      );
    }),
    { seed: SEED },
  );
});

Deno.test("literal quotes every string so a SQL reader gets the same string back", () => {
  assert(
    property(quotable, (text) => {
      assertEquals(unquoted(literal(text), "'"), text);
    }),
    { seed: SEED },
  );
});

Deno.test("identifier quotes every name so a SQL reader gets the same name back", () => {
  assert(
    property(quotable, (name) => {
      assertEquals(unquoted(identifier(name), '"'), name);
    }),
    { seed: SEED },
  );
});
