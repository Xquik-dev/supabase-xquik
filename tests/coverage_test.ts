import { latestRegistryMigration } from "../scripts/generate.ts";
import { assertEquals } from "@std/assert";
import { APIResource } from "x-twitter-scraper/core/resource";
import { z } from "zod";
import { handleDelivery } from "../supabase/functions/_shared/webhook.ts";
import { askDocs, createXquik, getSportsGameView } from "../supabase/functions/_shared/xquik.ts";
import { memoryStore, post, receiver, sampleEvent, signDelivery, TEST_ALERT } from "./delivery.ts";

const security = z.array(z.record(z.string(), z.unknown()));
const spec = z.object({
  security,
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
  components: z.object({
    schemas: z.object({
      EventType: z.object({ enum: z.array(z.string()) }),
      PostEventType: z.object({ enum: z.array(z.string()) }),
    }),
  }),
}).parse(JSON.parse(await Deno.readTextFile("openapi.json")));

type Operation = { id: string; method: string; template: string; inScope: boolean };

const operations: Operation[] = Object.entries(spec.paths).flatMap(([template, item]) =>
  ["get", "put", "post", "patch", "delete"].flatMap((method) => {
    if (item[method] === undefined) return [];
    const op = z.object({ operationId: z.string(), security: security.optional() }).parse(item[method]);
    const requirements = op.security ?? spec.security;
    const inScope = requirements.some((requirement) =>
      Object.keys(requirement).length === 0 || "apiKey" in requirement
    );
    return [{ id: op.operationId, method: method.toUpperCase(), template, inScope }];
  })
);
const inScope = operations.filter((op) => op.inScope);

function operationFor(method: string, path: string): Operation | undefined {
  const matches = operations.filter((op) => {
    const pattern = op.template.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}/g, "[^/]+");
    return op.method === method && new RegExp(`^${pattern}$`).test(path);
  });
  const params = (op: Operation) => op.template.split("{").length;
  return matches.sort((a, b) => params(a) - params(b))[0];
}

const recorded: { method: string; path: string }[] = [];
const fakeFetch: typeof fetch = (input, init) => {
  const url = input instanceof Request ? input.url : input;
  recorded.push({ method: init?.method ?? "GET", path: new URL(url).pathname });
  return Promise.resolve(Response.json({ _meta: {}, results: [] }));
};

const placeholder: object = new Proxy({}, {
  get: (_target, key) =>
    key === Symbol.toPrimitive ? () => "placeholder" : typeof key === "string" ? "placeholder" : undefined,
});

function resourcesOf(node: object): APIResource[] {
  return Object.values(node)
    .filter((value): value is APIResource => value instanceof APIResource)
    .flatMap((resource) => [resource, ...resourcesOf(resource)]);
}

async function requestOf(resource: APIResource, name: string) {
  const method: unknown = Reflect.get(resource, name);
  if (typeof method !== "function") return undefined;
  for (let count = 0; count <= method.length + 1; count++) {
    recorded.length = 0;
    const args = Array.from({ length: count }, () => placeholder);
    await Promise.resolve().then(() => Reflect.apply(method, resource, args)).catch(() => undefined);
    if (recorded.length === 1) return recorded[0];
  }
  return undefined;
}

Deno.test("every in-scope operation has a tested Supabase path", async () => {
  const client = createXquik({ apiKey: "placeholder", fetch: fakeFetch, maxRetries: 0 });
  const viaSdk = new Set<string>();
  for (const resource of resourcesOf(client)) {
    for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(resource))) {
      const request = name === "constructor" ? undefined : await requestOf(resource, name);
      const op = request && operationFor(request.method, request.path);
      if (op?.inScope) viaSdk.add(op.id);
    }
  }

  async function viaHelper(calls: (() => Promise<unknown>)[]) {
    const ids = new Set<string>();
    for (const call of calls) {
      recorded.length = 0;
      await call();
      for (const request of recorded) {
        const op = operationFor(request.method, request.path);
        if (op?.inScope) ids.add(op.id);
      }
    }
    return ids;
  }
  const viaAskDocs = await viaHelper(
    (["GET", "POST"] as const).map((method) => () =>
      askDocs({ query: "How do I monitor NASA?" }, { method, fetch: fakeFetch })
    ),
  );
  const viaSportsGameView = await viaHelper(
    (["roster", "player-props", "posts"] as const).map((view) => () =>
      getSportsGameView(client, view, "nfl", "401547417")
    ),
  );

  const migration = await Deno.readTextFile(await latestRegistryMigration());
  const registry = new Set(
    [...migration.matchAll(/^ {4}\('([^']+)', '([A-Z]+)', '([^']+)'/gm)].map(([, id, method, path]) =>
      `${id} ${method} ${path}`
    ),
  );

  const covered = new Set([...viaSdk, ...viaAskDocs, ...viaSportsGameView]);
  const withoutPath = inScope.filter((op) => !covered.has(op.id)).map((op) => op.id);
  const notInRegistry = inScope.filter((op) => !registry.has(`${op.id} ${op.method} ${op.template}`)).map((op) =>
    op.id
  );
  console.log(
    `${inScope.length - withoutPath.length} of ${inScope.length} in-scope operations have a tested path ` +
      `(${viaSdk.size} through SDK methods, ${viaAskDocs.size} through askDocs, ` +
      `${viaSportsGameView.size} through getSportsGameView). ` +
      `${inScope.length - notInRegistry.length} of ${inScope.length} are rows in the SQL registry.`,
  );
  assertEquals(withoutPath, []);
  assertEquals(notInRegistry, []);
});

Deno.test("every event type gets a receiver result", async () => {
  const eventTypes = [...spec.components.schemas.EventType.enum, ...spec.components.schemas.PostEventType.enum];
  const failures: string[] = [];
  for (const eventType of [...eventTypes, "webhook.test"]) {
    const { events, store } = memoryStore();
    const body = JSON.stringify(eventType === "webhook.test" ? TEST_ALERT : sampleEvent(eventType));
    const response = await handleDelivery(post(await signDelivery(body)), receiver(store).deps);
    const stored = [...events.values()].map((event) => event.eventType);
    const expected = eventType === "webhook.test" ? [] : [eventType];
    if (response.status !== 200 || JSON.stringify(stored) !== JSON.stringify(expected)) failures.push(eventType);
  }
  console.log(
    `${eventTypes.length + 1 - failures.length} of ${eventTypes.length + 1} event types get a receiver result ` +
      `(${eventTypes.length} stored once, plus the acked webhook.test alert).`,
  );
  assertEquals(failures, []);
});
