import { z } from "zod";

const METHODS = [
  { key: "get", method: "GET" },
  { key: "put", method: "PUT" },
  { key: "post", method: "POST" },
  { key: "patch", method: "PATCH" },
  { key: "delete", method: "DELETE" },
] as const;
const REF_PREFIX = "#/";
const NONE = 0;
const BEFORE = -1;
const AFTER = 1;

type Method = (typeof METHODS)[number]["method"];

const scopes = z.array(z.string());
const securityRequirements = z.array(z.record(z.string(), scopes));
const pathItem = z.object({
  delete: z.unknown().optional(),
  get: z.unknown().optional(),
  parameters: z.array(z.unknown()).default([]),
  patch: z.unknown().optional(),
  post: z.unknown().optional(),
  put: z.unknown().optional(),
});
const document = z.object({
  paths: z.record(z.string(), pathItem),
  security: securityRequirements,
});
const operation = z.object({
  operationId: z.string().nonempty(),
  parameters: z.array(z.unknown()).default([]),
  responses: z.record(z.string(), z.unknown()),
  security: securityRequirements.optional(),
});
const parameter = z.object({
  in: z.enum(["path", "query", "header", "cookie"]),
  name: z.string().nonempty(),
  schema: z.unknown(),
});
const reference = z.object({ $ref: z.string().startsWith(REF_PREFIX) });
const mediaType = z.object({ schema: z.unknown() });
const response = z.object({
  content: z.record(z.string(), mediaType).default({}),
});
const typeNames = z.union([z.string(), z.array(z.string())]);
const schemaNode = z.object({
  allOf: z.array(z.unknown()).default([]),
  anyOf: z.array(z.unknown()).default([]),
  enum: z.array(z.unknown()).default([]),
  oneOf: z.array(z.unknown()).default([]),
  properties: z.record(z.string(), z.unknown()).default({}),
  required: z.array(z.string()).default([]),
  type: typeNames.optional(),
});

interface Parameter {
  readonly name: string;
  readonly in: z.infer<typeof parameter>["in"];
  readonly type: string | null;
  readonly enum: readonly unknown[];
}

interface Operation {
  readonly operationId: string;
  readonly method: Method;
  readonly path: string;
  readonly parameters: readonly Parameter[];
  readonly json: { readonly properties: ReadonlySet<string> } | null;
  readonly listField: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerTarget(root: unknown, ref: string): unknown {
  let node = root;
  for (const token of ref.slice(REF_PREFIX.length).split("/")) {
    const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isRecord(node) || !(key in node)) {
      throw new Error(`openapi.json has a broken reference ${ref}`);
    }
    node = node[key];
  }
  return node;
}

function resolve(root: unknown, value: unknown): unknown {
  const parsed = reference.safeParse(value);
  if (!parsed.success) {
    return value;
  }
  return resolve(root, pointerTarget(root, parsed.data.$ref));
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
    if (node.required.includes(name) && isArraySchema(root, property)) {
      return name;
    }
  }
  for (const member of node.allOf) {
    const name = firstRequiredArrayProperty(root, member);
    if (name !== null) {
      return name;
    }
  }
  return sharedArrayProperty(root, [...node.oneOf, ...node.anyOf]);
}

function sharedArrayProperty(root: unknown, variants: readonly unknown[]): string | null {
  const names = variants.map((variant) => firstRequiredArrayProperty(root, variant));
  const [first] = names;
  if (typeof first === "string" && names.every((name) => name === first)) {
    return first;
  }
  return null;
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
  return { enum: node.enum, in: location, name, type };
}

function isPublic(security: ReadonlyArray<Record<string, unknown>>): boolean {
  return security.some((requirement) => Object.keys(requirement).length === NONE || "apiKey" in requirement);
}

function answerOf(root: unknown, responses: Record<string, unknown>): Pick<Operation, "json" | "listField"> {
  const json = response.parse(resolve(root, responses["200"] ?? {})).content["application/json"];
  if (!json) {
    return { json: null, listField: null };
  }
  return {
    json: { properties: new Set(propertyNames(root, json.schema)) },
    listField: firstRequiredArrayProperty(root, json.schema),
  };
}

function compareIds(left: string, right: string): number {
  if (left < right) {
    return BEFORE;
  }
  return AFTER;
}

function publicOperations(root: unknown): Operation[] {
  const spec = document.parse(root);
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    METHODS.flatMap(({ key, method }) => {
      const op = operation.optional().parse(item[key]);
      if (!op || !isPublic(op.security ?? spec.security)) {
        return [];
      }
      const { json, listField } = answerOf(root, op.responses);
      return [{
        json,
        listField,
        method,
        operationId: op.operationId,
        parameters: [...item.parameters, ...op.parameters].map((value) => resolveParameter(root, value)),
        path,
      }];
    })
  ).toSorted((left, right) => compareIds(left.operationId, right.operationId));
}

export { publicOperations, securityRequirements };
export type { Method, Operation, Parameter };
