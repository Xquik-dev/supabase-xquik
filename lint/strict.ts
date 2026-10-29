const PROOF = /https:\/\/|SPDX-(?:License-Identifier|FileCopyrightText):/u;
const ADJACENT = /^[^\S\n]*\n?[^\S\n]*$/u;
const PREVIOUS = 1;

interface Comment {
  readonly value: string;
  readonly range: Deno.lint.Range;
}

function adjacent(text: string, comment: Comment, next: Comment): boolean {
  return ADJACENT.test(text.slice(comment.range[1], next.range[0]));
}

function unproven(text: string, comments: readonly Comment[]): Comment[] {
  const proven = new Set<Comment>();
  const reversed = comments.toReversed();
  for (const [index, comment] of reversed.entries()) {
    const following = reversed.slice(index - PREVIOUS, index);
    if (PROOF.test(comment.value) || following.some((next) => proven.has(next) && adjacent(text, comment, next))) {
      proven.add(comment);
    }
  }
  return comments.filter((comment) => !proven.has(comment));
}

export default {
  name: "strict",
  rules: {
    "no-code-comments": {
      create(context): Deno.lint.LintVisitor {
        return {
          Program(): void {
            for (const comment of unproven(context.sourceCode.text, context.sourceCode.getAllComments())) {
              context.report({
                message: "Put the meaning in names, types and tests. A comment needs an https link that proves it.",
                range: comment.range,
              });
            }
          },
        };
      },
    },
    "no-type-assertion": {
      create(context): Deno.lint.LintVisitor {
        return {
          TSAsExpression(node): void {
            const type = node.typeAnnotation;
            const isConst = type.type === "TSTypeReference" && type.typeName.type === "Identifier" &&
              type.typeName.name === "const";
            if (!isConst) {
              context.report({ message: "Narrow the value or parse it instead of asserting its type.", node });
            }
          },
          TSTypeAssertion(node): void {
            context.report({ message: "Narrow the value or parse it instead of asserting its type.", node });
          },
        };
      },
    },
  },
} satisfies Deno.lint.Plugin;
