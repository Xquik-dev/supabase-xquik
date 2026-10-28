import { assertEquals } from "@std/assert";
import strict from "../lint/strict.ts";

const ASSERTION = "Narrow the value or parse it instead of asserting its type.";
const COMMENT = "Put the meaning in names, types and tests. A comment needs an https link that proves it.";

function findings(source: string): string[] {
  return Deno.lint.runPlugin(strict, "source.ts", source).map((diagnostic) =>
    `${diagnostic.id} ${source.slice(...diagnostic.range)} ${diagnostic.message}`
  );
}

Deno.test("no-type-assertion allows only as const", () => {
  assertEquals(
    findings(`const a = ["x"] as const;\nconst b = a as unknown;\nconst c = <string> b;\nexport { c };\n`),
    [`strict/no-type-assertion a as unknown ${ASSERTION}`, `strict/no-type-assertion <string> b ${ASSERTION}`],
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
    `strict/no-code-comments // This line explains nothing. ${COMMENT}`,
    `strict/no-code-comments /* A block comment. */ ${COMMENT}`,
  ]);
});
