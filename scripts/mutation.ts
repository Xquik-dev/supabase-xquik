import ts from "typescript";

export type Mutant = {
  readonly file: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly original: string;
  readonly replacement: string;
};
export type Outcome = "killed" | "survived" | "invalid";
export type Result = { readonly mutant: Mutant; readonly outcome: Outcome };

type Rewrite = readonly [pattern: RegExp, replace: (match: string) => string];

const TEST_PERMISSIONS = ["--allow-read", "--allow-write", "--allow-run", "--allow-env", "--allow-net"];
const RAN_TESTS = /^running \d+ tests? from /m;
const TIMEOUT_FACTOR = 5;
const MINIMUM_TIMEOUT_MS = 10 * 1000;
const BASELINE_TIMEOUT_MS = 30 * 60 * 1000;
const SET_PARENT_NODES = true;

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

const SQL_FUNCTION_BODY = /\bas \$\$[\s\S]*?\$\$/g;
const BODY_START = "as $$".length;
const SQL_STRING = /'(?:[^']|'')*'/g;
const SQL_REWRITES: readonly Rewrite[] = [
  [/ = /g, () => " <> "],
  [/ <> /g, () => " = "],
  [/ < /g, () => " <= "],
  [/ <= /g, () => " < "],
  [/ > /g, () => " >= "],
  [/ >= /g, () => " > "],
  [/(?<!between \S+) and /g, () => " or "],
  [/ or /g, () => " and "],
  [/ is null\b/g, () => " is not null"],
  [/ is not null\b/g, () => " is null"],
  [/(?<!not) between /g, () => " not between "],
  [/ not between /g, () => " between "],
  [/(?<!not) in \(/g, () => " not in ("],
  [/ not in \(/g, () => " in ("],
  [/\bnot found\b/g, () => "found"],
  [/(?<![\w.])\d+(?![\w.])/g, (digits) => String(Number(digits) + 1)],
];

function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

function emptied(literal: string, quote: string): string {
  return literal.length > 2 ? `${quote}${quote}` : `${quote}mutant${quote}`;
}

function typescriptMutants(file: string, text: string): Mutant[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, SET_PARENT_NODES);
  const found: Mutant[] = [];
  const add = (start: number, end: number, replacement: string): void => {
    found.push({ file, line: lineAt(text, start), start, end, original: text.slice(start, end), replacement });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    const start = node.getStart(source);
    if (ts.isBinaryExpression(node)) {
      const replacement = OPERATORS.get(node.operatorToken.kind);
      if (replacement !== undefined) add(node.operatorToken.getStart(source), node.operatorToken.end, replacement);
    } else if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      add(start, node.operand.getStart(source), "");
    } else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
      add(start, node.end, node.kind === ts.SyntaxKind.TrueKeyword ? "false" : "true");
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      const isKey = (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node;
      if (!isKey) add(start, node.end, emptied(node.getText(source), '"'));
    } else if (ts.isTemplateExpression(node)) {
      add(start, node.end, '""');
    } else if (ts.isExpressionStatement(node)) {
      add(start, node.end, ";");
    }
    if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) {
      const condition = ts.isIfStatement(node) ? node.expression : node.condition;
      add(condition.getStart(source), condition.end, "true");
      add(condition.getStart(source), condition.end, "false");
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
        return { file, line: lineAt(text, start), start, end, original: match[0], replacement: replace(match[0]) };
      })
    ).sort((left, right) => left.start - right.start);
  });
}

export function mutantsOf(file: string, text: string): Mutant[] {
  return file.endsWith(".sql") ? sqlMutants(file, text) : typescriptMutants(file, text);
}

function copyTree(from: string, to: string): void {
  Deno.mkdirSync(to, { recursive: true });
  for (const entry of Deno.readDirSync(from)) {
    const source = `${from}/${entry.name}`;
    const target = `${to}/${entry.name}`;
    if (entry.name === "node_modules") Deno.symlinkSync(source, target);
    else if (entry.isDirectory && entry.name !== ".git") copyTree(source, target);
    else if (entry.isFile) Deno.copyFileSync(source, target);
  }
}

type TestRun = { readonly passed: boolean; readonly compiled: boolean; readonly output: string; readonly ms: number };
type Covered = {
  readonly test: string;
  readonly ms: number;
  readonly files: ReadonlySet<string>;
  readonly lines: ReadonlySet<string>;
};

async function runTests(dir: string, tests: readonly string[], timeoutMs: number, report = ""): Promise<TestRun> {
  const env = Deno.env.toObject();
  delete env["DENO_COVERAGE_DIR"];
  const coverage = report === "" ? {} : { DENO_COVERAGE_DIR: report };
  const started = performance.now();
  const { success, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["test", "--fail-fast", ...TEST_PERMISSIONS, ...tests],
    cwd: dir,
    clearEnv: true,
    env: { ...env, ...coverage, NO_COLOR: "1", TMPDIR: `${dir}.tmp` },
    signal: AbortSignal.timeout(timeoutMs),
  }).output();
  const decoder = new TextDecoder();
  const output = `${decoder.decode(stdout)}${decoder.decode(stderr)}`;
  return { passed: success, compiled: RAN_TESTS.test(output), output, ms: performance.now() - started };
}

async function cover(dir: string, test: string, report: string): Promise<Covered> {
  const run = await runTests(dir, [test], BASELINE_TIMEOUT_MS, report);
  if (!run.passed) throw new Error(`${test} fails before any mutation.\n${run.output}`);
  const { stdout } = await new Deno.Command(Deno.execPath(), { args: ["coverage", "--lcov", report], cwd: dir })
    .output();
  const files = new Set<string>();
  const lines = new Set<string>();
  let file = "";
  for (const line of new TextDecoder().decode(stdout).split("\n")) {
    const [kind, number, hits] = line.split(/[:,]/);
    if (kind === "SF") files.add(file = line.slice(`SF:${dir}/`.length));
    if (kind === "DA" && hits !== "0") lines.add(`${file}:${number}`);
  }
  return { test, ms: run.ms, files, lines };
}

async function pool<T, R>(
  items: readonly T[],
  dirs: readonly string[],
  work: (dir: string, item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const queue = items.map((item, index) => ({ item, index }));
  await Promise.all(dirs.map(async (dir) => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      results[next.index] = await work(dir, next.item);
    }
  }));
  return results;
}

export async function runMutants(
  root: string,
  mutants: readonly Mutant[],
  tests: readonly string[],
  workers: number,
): Promise<Result[]> {
  const scratch = await Deno.realPath(await Deno.makeTempDir({ prefix: "xquik-mutation-" }));
  try {
    const copies = await Promise.all(Array.from({ length: Math.max(1, workers) }, async (_, index) => {
      copyTree(root, `${scratch}/${index}`);
      await Deno.mkdir(`${scratch}/${index}.tmp`);
      return `${scratch}/${index}`;
    }));
    const covered = await pool(tests, copies, (dir, test) => cover(dir, test, `${dir}.coverage/${test}`));
    return await pool(mutants, copies, async (dir, mutant): Promise<Result> => {
      const chosen = covered.some(({ files }) => files.has(mutant.file))
        ? covered.filter(({ lines }) => lines.has(`${mutant.file}:${mutant.line}`))
        : covered;
      if (chosen.length === 0) return { mutant, outcome: "survived" };
      const path = `${dir}/${mutant.file}`;
      const original = await Deno.readTextFile(path);
      await Deno.writeTextFile(path, original.slice(0, mutant.start) + mutant.replacement + original.slice(mutant.end));
      const timeoutMs = MINIMUM_TIMEOUT_MS + TIMEOUT_FACTOR * chosen.reduce((total, { ms }) => total + ms, 0);
      const run = await runTests(dir, chosen.map(({ test }) => test), timeoutMs);
      await Deno.writeTextFile(path, original);
      return { mutant, outcome: run.passed ? "survived" : run.compiled ? "killed" : "invalid" };
    });
  } finally {
    await Deno.remove(scratch, { recursive: true });
  }
}

export function score(results: readonly Result[]): number {
  const killed = results.filter(({ outcome }) => outcome === "killed").length;
  const survived = results.filter(({ outcome }) => outcome === "survived").length;
  return killed + survived === 0 ? 100 : Math.round((killed / (killed + survived)) * 10_000) / 100;
}

export function summary(results: readonly Result[]): string {
  const count = (outcome: Outcome): number => results.filter((result) => result.outcome === outcome).length;
  const survivors = results.filter(({ outcome }) => outcome === "survived").map(({ mutant }) =>
    `${mutant.file}:${mutant.line} replaces ${JSON.stringify(mutant.original)} with ${
      JSON.stringify(mutant.replacement)
    }, and every test still passes.`
  );
  return [
    ...survivors,
    `Mutation score is ${score(results).toFixed(2)}%. The tests killed ${count("killed")} of ${
      count("killed") + count("survived")
    } mutants that compiled. ${count("invalid")} of ${results.length} mutants did not compile.`,
  ].join("\n");
}
