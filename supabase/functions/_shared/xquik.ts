import { type ClientOptions, XTwitterScraper } from "x-twitter-scraper";
import { z } from "zod";

export function createXquik(options: ClientOptions = {}): XTwitterScraper {
  return new XTwitterScraper({ apiKey: Deno.env.get("XQUIK_API_KEY") ?? null, ...options });
}

export type SportsGameView = "roster" | "player-props" | "posts";

export function getSportsGameView(
  client: XTwitterScraper,
  view: SportsGameView,
  league: string,
  id: string,
  query: Record<string, string | number | boolean> = {},
): Promise<Record<string, unknown>> {
  return client.get<Record<string, unknown>>(
    `/x/sports/${encodeURIComponent(league)}/games/${encodeURIComponent(id)}/${view}`,
    { query },
  );
}

export type AskDocsInput = {
  readonly query: string;
  readonly site?: "docs.xquik.com" | "xquik.com";
  readonly mode?: "list";
  readonly response_format?: "chatgpt_app" | "conversational_search";
};

const answer = z.looseObject({
  _meta: z.looseObject({}),
  results: z.array(z.looseObject({})).optional(),
  content: z.array(z.object({ type: z.literal("text"), text: z.string() })).optional(),
  structuredData: z.array(z.looseObject({})).optional(),
});
export type AskDocsAnswer = z.infer<typeof answer>;

const failure = z.object({ error: z.object({ message: z.string() }) });

export async function askDocs(
  input: AskDocsInput,
  { method = "GET", fetch = globalThis.fetch }: {
    readonly method?: "GET" | "POST";
    readonly fetch?: typeof globalThis.fetch;
  } = {},
): Promise<AskDocsAnswer> {
  const url = new URL("https://xquik.com/ask");
  if (method === "GET") {
    for (const [name, value] of Object.entries(input)) url.searchParams.set(name, value);
  }
  const response = await fetch(
    url,
    method === "GET"
      ? { method }
      : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(input) },
  );
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = failure.safeParse(body);
    throw new Error(
      `Xquik docs search returned HTTP ${response.status}. ${parsed.success ? parsed.data.error.message : ""}`,
    );
  }
  return answer.parse(body);
}
