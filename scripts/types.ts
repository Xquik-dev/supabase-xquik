const KINDS = ["Enums", "CompositeTypes"] as const;
const EMPTY_MEMBER = /\{\n\s+\[_ in never\]: never;\n\s+\}/gv;
const OBJECT_ALIAS = /^export type (?<name>\w+) = \{$(?<body>.*?)^\};$/gmsv;
const ONE_LETTER_INFER = /(?<key>\w+): infer \p{Lu};(?<gap>\s+\} \? )\p{Lu}$/gmv;
const DECLARATION = /^export (?<keyword>const|interface|type) (?<name>\w+)/gmv;
const EXPORT_PREFIX = "export ";

function withoutEmptyKinds(types: string): string {
  let text = types;
  for (const kind of KINDS) {
    if (types.includes(`    ${kind}: {\n      [_ in never]: never;\n    };`)) {
      text = text.replace(`\n    | keyof DefaultSchema["${kind}"]`, "");
    }
  }
  return text;
}

function exportsLast(types: string): string {
  const typeNames: string[] = [];
  const valueNames: string[] = [];
  const body = types.replaceAll(DECLARATION, (declaration: string, keyword: string, name: string): string => {
    if (keyword === "const") {
      valueNames.push(name);
    } else {
      typeNames.push(name);
    }
    return declaration.slice(EXPORT_PREFIX.length);
  });
  return `${body}\nexport type { ${typeNames.join(", ")} };\nexport { ${valueNames.join(", ")} };\n`;
}

function normalizeTypes(types: string): string {
  const lintClean = withoutEmptyKinds(types)
    .replaceAll(EMPTY_MEMBER, "Record<symbol, never>")
    .replaceAll(OBJECT_ALIAS, "export interface $<name> {$<body>}")
    .replaceAll(ONE_LETTER_INFER, "$<key>: infer $<key>;$<gap>$<key>");
  return exportsLast(lintClean);
}

if (import.meta.main) {
  await Promise.all(Deno.args.map(async (file) => {
    const types = await Deno.readTextFile(file);
    await Deno.writeTextFile(file, normalizeTypes(types));
  }));
}

export default normalizeTypes;
