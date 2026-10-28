import { assertEquals } from "@std/assert";
import strict from "@/lint/strict.ts";

function findings(source: string): string[] {
  return Deno.lint.runPlugin(strict, "source.ts", source).map((diagnostic) =>
    `${diagnostic.id} ${source.slice(...diagnostic.range)}`
  );
}

Deno.test("no-type-assertion allows only as const", () => {
  assertEquals(
    findings(`const a = ["x"] as const;\nconst b = a as unknown;\nconst c = <string> b;\nexport { c };\n`),
    ["strict/no-type-assertion a as unknown", "strict/no-type-assertion <string> b"],
  );
});

Deno.test("no-code-comments keeps only comments that an https link or an SPDX tag proves", () => {
  const tag = "License-Identifier";
  const source = [
    `// SPDX-${tag}: Apache-2.0`,
    "// The runtime sorts keys, as its spec says.",
    "// https://example.com/spec",
    "const a = 1;",
    "// This line explains nothing.",
    "",
    "// https://example.com/unrelated",
    "/* A block comment. */",
    "export { a };",
  ].join("\n");
  assertEquals(findings(source), [
    "strict/no-code-comments // This line explains nothing.",
    "strict/no-code-comments /* A block comment. */",
  ]);
});
