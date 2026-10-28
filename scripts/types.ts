const KINDS = ["Enums", "CompositeTypes"] as const;

export function withoutEmptyKinds(types: string): string {
  return KINDS.reduce(
    (text, kind) =>
      text.includes(`    ${kind}: {\n      [_ in never]: never;\n    };`)
        ? text.replace(`\n    | keyof DefaultSchema["${kind}"]`, "")
        : text,
    types,
  );
}

if (import.meta.main) {
  for (const file of Deno.args) {
    await Deno.writeTextFile(file, withoutEmptyKinds(await Deno.readTextFile(file)));
  }
}
