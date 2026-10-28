const PROOF = /https:\/\/|SPDX-(?:License-Identifier|FileCopyrightText):/;
const ADJACENT = /^[^\S\n]*\n?[^\S\n]*$/;

type Comment = { readonly value: string; readonly range: Deno.lint.Range };

function unproven(text: string, comments: readonly Comment[]): Comment[] {
  const kept: Comment[] = [];
  let next: { readonly comment: Comment; readonly proven: boolean } | undefined;
  for (const comment of comments.toReversed()) {
    const proven = PROOF.test(comment.value) ||
      (next?.proven === true && ADJACENT.test(text.slice(comment.range[1], next.comment.range[0])));
    if (!proven) kept.push(comment);
    next = { comment, proven };
  }
  return kept.toReversed();
}

export default {
  name: "strict",
  rules: {
    "no-type-assertion": {
      create(context): Deno.lint.LintVisitor {
        return {
          TSAsExpression(node): void {
            const type = node.typeAnnotation;
            const isConst = type.type === "TSTypeReference" && type.typeName.type === "Identifier" &&
              type.typeName.name === "const";
            if (!isConst) {
              context.report({ node, message: "Narrow the value or parse it instead of asserting its type." });
            }
          },
          TSTypeAssertion(node): void {
            context.report({ node, message: "Narrow the value or parse it instead of asserting its type." });
          },
        };
      },
    },
    "no-code-comments": {
      create(context): Deno.lint.LintVisitor {
        return {
          Program(): void {
            for (const comment of unproven(context.sourceCode.text, context.sourceCode.getAllComments())) {
              context.report({
                range: comment.range,
                message: "Put the meaning in names, types and tests. A comment needs an https link that proves it.",
              });
            }
          },
        };
      },
    },
  },
} satisfies Deno.lint.Plugin;
