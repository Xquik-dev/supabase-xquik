import type { ClientOptions } from "x-twitter-scraper";
import parseJson from "./json.ts";
import { XTwitterScraper } from "x-twitter-scraper";
import { z } from "zod";

function createXquik(options: ClientOptions = {}): XTwitterScraper {
  return new XTwitterScraper({ apiKey: Deno.env.get("XQUIK_API_KEY") ?? null, ...options });
}

type SportsGameView = "roster" | "player-props" | "posts";

async function getSportsGameView(
  client: XTwitterScraper,
  { id, league, query = {}, view }: {
    readonly id: string;
    readonly league: string;
    readonly query?: Record<string, string | number | boolean>;
    readonly view: SportsGameView;
  },
): Promise<Record<string, unknown>> {
  return await client.get<Record<string, unknown>>(
    `/x/sports/${encodeURIComponent(league)}/games/${encodeURIComponent(id)}/${view}`,
    { query },
  );
}

interface AskDocsInput {
  readonly query: string;
  readonly site?: "docs.xquik.com" | "xquik.com";
  readonly mode?: "list";
  readonly "response_format"?: "chatgpt_app" | "conversational_search";
}

const textPart = z.object({ text: z.string(), type: z.literal("text") });
const answer = z.looseObject({
  _meta: z.looseObject({}),
  content: z.array(textPart).optional(),
  results: z.array(z.looseObject({})).optional(),
  structuredData: z.array(z.looseObject({})).optional(),
});
type AskDocsAnswer = z.infer<typeof answer>;

const failure = z.object({ error: z.object({ message: z.string() }) });

function requestFor(input: AskDocsInput, method: "GET" | "POST"): { readonly init: RequestInit; readonly url: URL } {
  const url = new URL("https://xquik.com/ask");
  if (method === "POST") {
    return { init: { body: JSON.stringify(input), headers: { "content-type": "application/json" }, method }, url };
  }
  for (const [name, value] of Object.entries({ ...input })) {
    url.searchParams.set(name, value);
  }
  return { init: { method }, url };
}

async function askDocs(
  input: AskDocsInput,
  { method = "GET", fetch = globalThis.fetch }: {
    readonly method?: "GET" | "POST";
    readonly fetch?: typeof globalThis.fetch;
  } = {},
): Promise<AskDocsAnswer> {
  const { init, url } = requestFor(input, method);
  const response = await fetch(url, init);
  const body: unknown = parseJson(await response.text());
  if (!response.ok) {
    const parsed = failure.safeParse(body);
    const status = `Xquik docs search returned HTTP ${String(response.status)}.`;
    if (parsed.success) {
      throw new Error(`${status} ${parsed.data.error.message}`);
    }
    throw new Error(status);
  }
  return answer.parse(body);
}

export { askDocs, createXquik, getSportsGameView };
export type { AskDocsAnswer, AskDocsInput, SportsGameView };
