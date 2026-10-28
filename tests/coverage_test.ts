import { askDocs, createXquik, getSportsGameView } from "@shared/xquik.ts";
import { assertEquals, assertExists } from "@std/assert";
import { latestMigration, REGISTRY_SUFFIX as registrySuffix } from "@/scripts/generate.ts";
import { memoryStore, post, receiver, sampleEvent, signDelivery, TEST_ALERT as testAlert } from "./delivery.ts";
import { APIResource } from "x-twitter-scraper/core/resource";
import { handleDelivery } from "@shared/webhook.ts";
import parseJson from "@shared/json.ts";
import { securityRequirements } from "@/scripts/openapi.ts";
import { z } from "zod";

const NONE = 0;
const SINGLE = 1;
const ATTEMPTS_PAST_ARITY = 2;
const HTTP_OK = 200;
const WEBHOOK_TEST = "webhook.test";
const METHODS = ["get", "put", "post", "patch", "delete"];

const enumValues = z.object({ enum: z.array(z.string()) });
const pathItems = z.record(z.string(), z.record(z.string(), z.unknown()));
const openapi: unknown = parseJson(await Deno.readTextFile("openapi.json"));
const spec = z.object({
  components: z.object({ schemas: z.object({ EventType: enumValues, PostEventType: enumValues }) }),
  paths: pathItems,
  security: securityRequirements,
}).parse(openapi);

interface Operation {
  id: string;
  method: string;
  template: string;
  inScope: boolean;
}

const operationSchema = z.object({ operationId: z.string(), security: securityRequirements.optional() });

function operationOf(template: string, method: string, definition: unknown): Operation {
  const op = operationSchema.parse(definition);
  const requirements = op.security ?? spec.security;
  const inScope = requirements.some((requirement) =>
    Object.keys(requirement).length === NONE || "apiKey" in requirement
  );
  return { id: op.operationId, inScope, method: method.toUpperCase(), template };
}

const operations: Operation[] = Object.entries(spec.paths).flatMap(([template, item]) =>
  METHODS.filter((method) => method in item).map((method) => operationOf(template, method, item[method]))
);
const inScope = operations.filter((op) => op.inScope);

function patternOf(template: string): RegExp {
  const escaped = template.replaceAll(/[.*+?^$()|[\]\\]/gu, String.raw`\$&`);
  return new RegExp(`^${escaped.replaceAll(/\{[^}]+\}/gu, "[^/]+")}$`, "u");
}

function placeholderCount(op: Operation): number {
  return op.template.split("{").length;
}

function operationFor(method: string, path: string): Operation | undefined {
  const matches = operations.filter((op) => op.method === method && patternOf(op.template).test(path));
  return matches.toSorted((left, right) => placeholderCount(left) - placeholderCount(right))[0];
}

interface Recorded {
  method: string;
  path: string;
}
const recorded: Recorded[] = [];

function urlOf(input: RequestInfo | URL): string | URL {
  if (input instanceof Request) {
    return input.url;
  }
  return input;
}

const fakeFetch: typeof fetch = async (input, init) => {
  const { pathname } = new URL(urlOf(input));
  recorded.push({ method: init?.method ?? "GET", path: pathname });
  return await Promise.resolve(Response.json({ _meta: {}, results: [] }));
};

function placeholderField(target: object, key: string | symbol): unknown {
  if (key === Symbol.toPrimitive) {
    return () => "placeholder";
  }
  if (typeof key === "string") {
    return "placeholder";
  }
  return Reflect.get(target, key);
}

const placeholder: object = new Proxy({}, { get: placeholderField });

type Resource = APIResource & Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function resourcesOf(node: unknown): Resource[] {
  if (!isRecord(node)) {
    return [];
  }
  const children = Object.values(node).filter((value): value is Resource => value instanceof APIResource);
  return [...children, ...children.flatMap((child) => resourcesOf(child))];
}

function methodNamesOf(resource: Resource): string[] {
  const prototype = Reflect.getPrototypeOf(resource) ?? {};
  return Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor");
}

function attemptsOf(resource: Resource, name: string): Array<() => unknown> {
  const method = resource[name];
  if (!isCallable(method)) {
    return [];
  }
  const argumentLists = Array.from(
    { length: method.length + ATTEMPTS_PAST_ARITY },
    (_unused, count) => Array.from({ length: count }, () => placeholder),
  );
  return argumentLists.map((args) => () => method.apply(resource, args));
}

async function settled(call: () => unknown): Promise<unknown> {
  try {
    return await call();
  } catch (error) {
    return error;
  }
}

async function recordingOf(call: () => Promise<unknown>): Promise<Recorded[]> {
  recorded.length = NONE;
  await call();
  return [...recorded];
}

async function firstLoneRequest(attempts: ReadonlyArray<() => unknown>): Promise<Recorded[]> {
  const [attempt, ...rest] = attempts;
  if (!attempt) {
    return [];
  }
  const requests = await recordingOf(async () => await settled(attempt));
  if (requests.length === SINGLE) {
    return requests;
  }
  return await firstLoneRequest(rest);
}

async function inSequence<Item extends object>(
  items: readonly Item[],
  each: (item: Item) => Promise<Recorded[]>,
): Promise<Recorded[]> {
  const [item, ...rest] = items;
  if (!item) {
    return [];
  }
  const first = await each(item);
  const others = await inSequence(rest, each);
  return [...first, ...others];
}

async function recordingsOf(calls: ReadonlyArray<() => Promise<unknown>>): Promise<Recorded[]> {
  return await inSequence(calls, async (call) => await recordingOf(call));
}

function inScopeIdsOf(request: Recorded): string[] {
  const op = operationFor(request.method, request.path);
  if (op?.inScope === true) {
    return [op.id];
  }
  return [];
}

function idsOf(requests: readonly Recorded[]): Set<string> {
  return new Set(requests.flatMap((request) => inScopeIdsOf(request)));
}

const client = createXquik({ apiKey: "placeholder", fetch: fakeFetch, maxRetries: 0 });
const sdkAttempts = resourcesOf(client).flatMap((resource) =>
  methodNamesOf(resource).map((name) => attemptsOf(resource, name))
);
const askDocsCalls = (["GET", "POST"] as const).map((method) => async (): Promise<unknown> =>
  await askDocs({ query: "How do I monitor NASA?" }, { fetch: fakeFetch, method })
);
const sportsGameViewCalls = (["roster", "player-props", "posts"] as const).map((view) => async (): Promise<unknown> =>
  await getSportsGameView(client, { id: "401547417", league: "nfl", view })
);

async function registryRows(): Promise<Set<string>> {
  const latest = latestMigration(registrySuffix);
  assertExists(latest);
  const migration = await Deno.readTextFile(latest);
  const rows = migration.matchAll(/^ {4}\('(?<id>[^']+)', '(?<method>[A-Z]+)', '(?<path>[^']+)'/gmu);
  return new Set(
    Array.from(
      rows,
      ({ groups }) => `${String(groups?.["id"])} ${String(groups?.["method"])} ${String(groups?.["path"])}`,
    ),
  );
}

Deno.test("every in-scope operation has a tested Supabase path", async () => {
  const viaSdk = idsOf(await inSequence(sdkAttempts, async (attempts) => await firstLoneRequest(attempts)));
  const viaAskDocs = idsOf(await recordingsOf(askDocsCalls));
  const viaSportsGameView = idsOf(await recordingsOf(sportsGameViewCalls));
  const registry = await registryRows();
  const covered = new Set([...viaSdk, ...viaAskDocs, ...viaSportsGameView]);
  const withoutPath = inScope.filter((op) => !covered.has(op.id)).map((op) => op.id);
  const notInRegistry = inScope.filter((op) => !registry.has(`${op.id} ${op.method} ${op.template}`)).map((op) =>
    op.id
  );
  assertEquals(
    withoutPath,
    [],
    `${String(viaSdk.size)} operations have a tested path through SDK methods, ${
      String(viaAskDocs.size)
    } through askDocs and ${String(viaSportsGameView.size)} through getSportsGameView.`,
  );
  assertEquals(notInRegistry, [], `${String(inScope.length)} in-scope operations need a row in the SQL registry.`);
});

function deliveryFor(eventType: string): { readonly body: unknown; readonly expected: readonly string[] } {
  if (eventType === WEBHOOK_TEST) {
    return { body: testAlert, expected: [] };
  }
  return { body: sampleEvent(eventType), expected: [eventType] };
}

async function failureOf(eventType: string): Promise<string[]> {
  const { body, expected } = deliveryFor(eventType);
  const { events, store } = memoryStore();
  const signed = await signDelivery(JSON.stringify(body));
  const response = await handleDelivery(post(signed), receiver(store).deps);
  const stored = [...events.values()].map((event) => event.eventType);
  if (response.status === HTTP_OK && JSON.stringify(stored) === JSON.stringify(expected)) {
    return [];
  }
  return [eventType];
}

Deno.test("every event type gets a receiver result", async () => {
  const eventTypes = [...spec.components.schemas.EventType.enum, ...spec.components.schemas.PostEventType.enum];
  const deliveries = [...eventTypes, WEBHOOK_TEST].map(async (eventType) => await failureOf(eventType));
  const failures = await Promise.all(deliveries);
  assertEquals(
    failures.flat(),
    [],
    `${String(eventTypes.length)} event types are stored once, and the ${WEBHOOK_TEST} alert is acked.`,
  );
});
