const SUPPRESSION = /^\s*(?:deno-lint-ignore|@ts-ignore|@ts-expect-error|@ts-nocheck)/;

export default {
  name: "strict",
  rules: {
    "no-type-assertion": {
      create(context) {
        return {
          TSAsExpression(node) {
            const type = node.typeAnnotation;
            const isConst = type.type === "TSTypeReference" && type.typeName.type === "Identifier" &&
              type.typeName.name === "const";
            if (!isConst) {
              context.report({ node, message: "Narrow the value or parse it instead of asserting its type." });
            }
          },
          TSTypeAssertion(node) {
            context.report({ node, message: "Narrow the value or parse it instead of asserting its type." });
          },
        };
      },
    },
    "no-suppression": {
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              if (SUPPRESSION.test(comment.value)) {
                context.report({ range: comment.range, message: "Fix the finding instead of suppressing it." });
              }
            }
          },
        };
      },
    },
  },
} satisfies Deno.lint.Plugin;
