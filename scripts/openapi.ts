import { z } from "zod";

const METHODS = [["get", "GET"], ["put", "PUT"], ["post", "POST"], ["patch", "PATCH"], ["delete", "DELETE"]] as const;

export type Method = (typeof METHODS)[number][1];

export const securityRequirements = z.array(z.record(z.string(), z.array(z.string())));
const document = z.object({
  security: securityRequirements,
  paths: z.record(
    z.string(),
    z.object({
      parameters: z.array(z.unknown()).default([]),
      get: z.unknown().optional(),
      put: z.unknown().optional(),
      post: z.unknown().optional(),
      patch: z.unknown().optional(),
      delete: z.unknown().optional(),
    }),
  ),
});
const operation = z.object({
  operationId: z.string().min(1),
  security: securityRequirements.optional(),
  parameters: z.array(z.unknown()).default([]),
  responses: z.record(z.string(), z.unknown()),
});
const parameter = z.object({
  name: z.string().min(1),
  in: z.enum(["path", "query", "header", "cookie"]),
  schema: z.unknown(),
});
const reference = z.object({ $ref: z.string().startsWith("#/") });
const response = z.object({
  content: z.record(z.string(), z.object({ schema: z.unknown() })).default({}),
});
const schemaNode = z.object({
  type: z.union([z.string(), z.array(z.string())]).optional(),
  enum: z.array(z.unknown()).default([]),
  properties: z.record(z.string(), z.unknown()).default({}),
  required: z.array(z.string()).default([]),
  allOf: z.array(z.unknown()).default([]),
  oneOf: z.array(z.unknown()).default([]),
  anyOf: z.array(z.unknown()).default([]),
});

export type Parameter = {
  readonly name: string;
  readonly in: z.infer<typeof parameter>["in"];
  readonly type: string | null;
  readonly enum: readonly unknown[];
};

export type Operation = {
  readonly operationId: string;
  readonly method: Method;
  readonly path: string;
  readonly parameters: readonly Parameter[];
  readonly json: { readonly properties: ReadonlySet<string> } | undefined;
  readonly listField: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolve(root: unknown, value: unknown): unknown {
  const parsed = reference.safeParse(value);
  if (!parsed.success) return value;
  const target = parsed.data.$ref
    .slice(2)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((node, token) => (isRecord(node) ? node[token] : undefined), root);
  if (target === undefined) throw new Error(`openapi.json has a broken reference ${parsed.data.$ref}`);
  return resolve(root, target);
}

function schemaAt(root: unknown, value: unknown): z.infer<typeof schemaNode> {
  return schemaNode.parse(resolve(root, value));
}

function isArraySchema(root: unknown, value: unknown): boolean {
  return [schemaAt(root, value).type].flat().includes("array");
}

function firstRequiredArrayProperty(root: unknown, value: unknown): string | null {
  const node = schemaAt(root, value);
  for (const [name, property] of Object.entries(node.properties)) {
    if (node.required.includes(name) && isArraySchema(root, property)) return name;
  }
  for (const member of node.allOf) {
    const name = firstRequiredArrayProperty(root, member);
    if (name !== null) return name;
  }
  const names = [...node.oneOf, ...node.anyOf].map((variant) => firstRequiredArrayProperty(root, variant));
  const [first] = names;
  return first !== undefined && names.every((name) => name === first) ? first : null;
}

function propertyNames(root: unknown, value: unknown): string[] {
  const node = schemaAt(root, value);
  return [
    ...Object.keys(node.properties),
    ...[...node.allOf, ...node.oneOf, ...node.anyOf].flatMap((member) => propertyNames(root, member)),
  ];
}

function resolveParameter(root: unknown, value: unknown): Parameter {
  const { name, in: location, schema } = parameter.parse(resolve(root, value));
  const node = schemaAt(root, schema);
  const type = [node.type ?? []].flat().find((candidate) => candidate !== "null") ?? null;
  return { name, in: location, type, enum: node.enum };
}

function isPublic(security: readonly Record<string, unknown>[]): boolean {
  return security.some((requirement) => Object.keys(requirement).length === 0 || "apiKey" in requirement);
}

export function publicOperations(root: unknown): Operation[] {
  const spec = document.parse(root);
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    METHODS.flatMap(([key, method]) => {
      const op = operation.optional().parse(item[key]);
      if (op === undefined || !isPublic(op.security ?? spec.security)) return [];
      const json = response.parse(resolve(root, op.responses["200"] ?? {})).content["application/json"];
      return [{
        operationId: op.operationId,
        method,
        path,
        parameters: [...item.parameters, ...op.parameters].map((value) => resolveParameter(root, value)),
        json: json === undefined ? undefined : { properties: new Set(propertyNames(root, json.schema)) },
        listField: json === undefined ? null : firstRequiredArrayProperty(root, json.schema),
      }];
    })
  ).sort((a, b) => (a.operationId < b.operationId ? -1 : 1));
}
