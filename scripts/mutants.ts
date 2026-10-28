import ts from "typescript";
import { z } from "zod";

interface Mutant {
  readonly file: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly original: string;
  readonly replacement: string;
}
type Rewrite = readonly [pattern: RegExp, replace: (match: string) => string];
interface Source {
  readonly text: string;
  readonly mutants: readonly Mutant[];
}
interface Plan {
  readonly mutants: readonly Mutant[];
  readonly equivalent: number;
  readonly stale: readonly string[];
}

const SET_PARENT_NODES = true;
const TEXT_START = 0;
const SQL_NUMBER_STEP = 1;
const QUOTES_ONLY = 2;
const MIN_REASON_LENGTH = 1;
const EXACTLY_ONE = 1;
const REGEXP_SYNTAX = /[$()*+.?[\\\]^{|}]/gu;
const WHITESPACE = /\s+/u;

const equivalents = z.array(z.strictObject({
  context: z.string(),
  file: z.string(),
  original: z.string(),
  reason: z.string().min(MIN_REASON_LENGTH),
  replacement: z.string(),
}));
type Equivalent = z.infer<typeof equivalents>[number];

const OPERATORS = new Map<ts.SyntaxKind, string>([
  [ts.SyntaxKind.EqualsEqualsEqualsToken, "!=="],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, "==="],
  [ts.SyntaxKind.LessThanToken, "<="],
  [ts.SyntaxKind.LessThanEqualsToken, "<"],
  [ts.SyntaxKind.GreaterThanToken, ">="],
  [ts.SyntaxKind.GreaterThanEqualsToken, ">"],
  [ts.SyntaxKind.AmpersandAmpersandToken, "||"],
  [ts.SyntaxKind.BarBarToken, "&&"],
  [ts.SyntaxKind.QuestionQuestionToken, "&&"],
  [ts.SyntaxKind.PlusToken, "-"],
  [ts.SyntaxKind.MinusToken, "+"],
  [ts.SyntaxKind.AsteriskToken, "/"],
  [ts.SyntaxKind.SlashToken, "*"],
]);

const SQL_FUNCTION_BODY = /\bas \$\$[\s\S]*?\$\$/gu;
const BODY_START = "as $$".length;
const SQL_STRING = /'(?:[^']|'')*'/gu;
const SQL_REWRITES: readonly Rewrite[] = [
  [/ = /gu, () => " <> "],
  [/ <> /gu, () => " = "],
  [/ < /gu, () => " <= "],
  [/ <= /gu, () => " < "],
  [/ > /gu, () => " >= "],
  [/ >= /gu, () => " > "],
  [/(?<!between \S+) and /gu, () => " or "],
  [/ or /gu, () => " and "],
  [/ is null\b/gu, () => " is not null"],
  [/ is not null\b/gu, () => " is null"],
  [/(?<!not) between /gu, () => " not between "],
  [/ not between /gu, () => " between "],
  [/(?<!not) in \(/gu, () => " not in ("],
  [/ not in \(/gu, () => " in ("],
  [/\bnot found\b/gu, () => "found"],
  [/(?<![\w.])\d+(?![\w.])/gu, (digits) => String(Number(digits) + SQL_NUMBER_STEP)],
];

function lineAt(text: string, offset: number): number {
  return text.slice(TEXT_START, offset).split("\n").length;
}

function emptied(literal: string, quote: string): string {
  if (literal.length > QUOTES_ONLY) {
    return `${quote}${quote}`;
  }
  return `${quote}mutant${quote}`;
}

type Edit = readonly [start: number, end: number, replacement: string];

function isKey(node: ts.Node): boolean {
  const { parent } = node;
  return (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node;
}

function flipped(node: ts.Node): string {
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return "false";
  }
  return "true";
}

function stringEdits(node: ts.Node, source: ts.SourceFile, start: number): Edit[] {
  if (isKey(node)) {
    return [];
  }
  return [[start, node.end, emptied(node.getText(source), '"')]];
}

function literalEdits(node: ts.Node, source: ts.SourceFile, start: number): Edit[] {
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return [[start, node.end, flipped(node)]];
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return stringEdits(node, source, start);
  }
  if (ts.isTemplateExpression(node)) {
    return [[start, node.end, '""']];
  }
  if (ts.isExpressionStatement(node)) {
    return [[start, node.end, ";"]];
  }
  return [];
}

function nodeEdits(node: ts.Node, source: ts.SourceFile): Edit[] {
  const start = node.getStart(source);
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken;
    return [OPERATORS.get(operator.kind)].filter((replacement) => typeof replacement === "string")
      .map((replacement): Edit => [operator.getStart(source), operator.end, replacement]);
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    return [[start, node.operand.getStart(source), ""]];
  }
  return literalEdits(node, source, start);
}

function conditionOf(node: ts.IfStatement | ts.ConditionalExpression): ts.Expression {
  if (ts.isIfStatement(node)) {
    return node.expression;
  }
  return node.condition;
}

function conditionEdits(node: ts.Node, source: ts.SourceFile): Edit[] {
  if (!ts.isIfStatement(node) && !ts.isConditionalExpression(node)) {
    return [];
  }
  const condition = conditionOf(node);
  return [[condition.getStart(source), condition.end, "true"], [condition.getStart(source), condition.end, "false"]];
}

function typescriptMutants(file: string, text: string): Mutant[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, SET_PARENT_NODES);
  const found: Mutant[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      return;
    }
    for (const [start, end, replacement] of [...nodeEdits(node, source), ...conditionEdits(node, source)]) {
      found.push({ end, file, line: lineAt(text, start), original: text.slice(start, end), replacement, start });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function sqlMutants(file: string, text: string): Mutant[] {
  return [...text.matchAll(SQL_FUNCTION_BODY)].flatMap((body) => {
    const offset = body.index + BODY_START;
    const code = body[0].slice(BODY_START, -"$$".length);
    const strings = [...code.matchAll(SQL_STRING)].map((match) => ({
      from: match.index,
      to: match.index + match[0].length,
    }));
    const inString = (start: number): boolean => strings.some(({ from, to }) => start >= from && start < to);
    const rewrites: Rewrite[] = [[SQL_STRING, (literal) => emptied(literal, "'")], ...SQL_REWRITES];
    return rewrites.flatMap(([pattern, replace]) =>
      [...code.matchAll(pattern)].filter((match) => pattern === SQL_STRING || !inString(match.index)).map((match) => {
        const start = offset + match.index;
        const end = start + match[0].length;
        return { end, file, line: lineAt(text, start), original: match[0], replacement: replace(match[0]), start };
      })
    ).toSorted((left, right) => left.start - right.start);
  });
}

function mutantsOf(file: string, text: string): Mutant[] {
  if (file.endsWith(".sql")) {
    return sqlMutants(file, text);
  }
  return typescriptMutants(file, text);
}

function spans(text: string, context: string): Array<readonly [from: number, to: number]> {
  const words = context.split(WHITESPACE).map((word) => word.replaceAll(REGEXP_SYNTAX, String.raw`\$&`));
  const found = [...text.matchAll(new RegExp(words.join(String.raw`\s+`), "gu"))];
  return found.map((match) => [match.index, match.index + match[0].length] as const);
}

function claimed(sources: ReadonlyMap<string, Source>, entry: Equivalent): readonly Mutant[] {
  const source = sources.get(entry.file);
  if (!source) {
    return [];
  }
  const found = spans(source.text, entry.context);
  return source.mutants.filter((mutant) =>
    mutant.original === entry.original && mutant.replacement === entry.replacement &&
    found.some(([from, to]) => from <= mutant.start && mutant.end <= to)
  );
}

function staleLine(entry: Equivalent, count: number): string {
  return `${entry.file} has ${String(count)} mutants that replace ${JSON.stringify(entry.original)} with ${
    JSON.stringify(entry.replacement)
  } inside ${JSON.stringify(entry.context)}, and an equivalent entry must name exactly 1.`;
}

function plan(texts: ReadonlyMap<string, string>, entries: readonly Equivalent[]): Plan {
  const sources = new Map([...texts].map(([file, text]) => [file, { mutants: mutantsOf(file, text), text }] as const));
  const claims = entries.map((entry) => ({ entry, named: claimed(sources, entry) }));
  const equivalent = new Set(claims.filter(({ named }) => named.length === EXACTLY_ONE).flatMap(({ named }) => named));
  const all = [...sources.values()].flatMap((source) => source.mutants);
  return {
    equivalent: equivalent.size,
    mutants: all.filter((mutant) => !equivalent.has(mutant)),
    stale: claims.filter(({ named }) => named.length !== EXACTLY_ONE).map(({ entry, named }) =>
      staleLine(entry, named.length)
    ),
  };
}

export { equivalents, mutantsOf, plan };
export type { Equivalent, Mutant };
