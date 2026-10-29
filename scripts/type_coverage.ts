import parseJson from "@shared/json.ts";
import ts from "typescript";
import { z } from "zod";

interface Site {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
}
interface Report {
  readonly checked: number;
  readonly uncovered: readonly Site[];
  readonly statements: number;
  readonly floating: readonly Site[];
}

const REMOTE_ROOT = "/deno-remote/";
const DENO_TYPES = "/deno-types/lib.deno.d.ts";
const DENO_LIB_REFERENCE = /^\/\/\/ <reference lib="deno\.[^"]+" \/>$/gmu;
const SITE_TEXT = 80;
const TEXT_START = 0;
const ONE_BASED = 1;
const NONE = 0;
const FULL = 100;
const PERCENT_DECIMALS = 2;
const KEYWORD_LITERALS = new Set([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword]);

const resolved = z.object({ specifier: z.string() });
const typeDependency = z.object({ specifier: z.string(), type: resolved });
const codeDependency = z.object({ code: resolved, specifier: z.string() });
const denoDependency = z.union([typeDependency, codeDependency]);
const denoModule = z.object({
  dependencies: z.array(denoDependency).default([]),
  local: z.string().optional(),
  specifier: z.string(),
});
const denoInfo = z.object({ modules: z.array(denoModule), redirects: z.record(z.string(), z.string()) });
const typeFiles = z.array(z.string()).default([]);
const denoConfig = z.object({ compilerOptions: z.looseObject({ types: typeFiles }) });

interface Graph {
  readonly sources: ReadonlyMap<string, string>;
  readonly dependencies: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

const verdicts = new WeakMap<ts.Type, boolean>();

async function deno(root: string, args: readonly string[]): Promise<string> {
  const output = await new Deno.Command(Deno.execPath(), { args: [...args], cwd: root, stderr: "inherit" }).output();
  if (!output.success) {
    throw new Error(`deno ${String(args[0])} failed with exit code ${String(output.code)}.`);
  }
  return new TextDecoder().decode(output.stdout);
}

function remotePath(specifier: string): string {
  return `${REMOTE_ROOT}${specifier.replace(/^https:\/\//u, "")}`;
}

function targetOf(dependency: z.infer<typeof denoDependency>): string {
  if ("type" in dependency) {
    return dependency.type.specifier;
  }
  return dependency.code.specifier;
}

async function moduleGraph(root: string, files: readonly string[]): Promise<Graph> {
  const infos = await Promise.all(
    files.map(async (file) => denoInfo.parse(parseJson(await deno(root, ["info", "--json", file])))),
  );
  const modules = infos.flatMap((info) => info.modules);
  const redirects = new Map(infos.flatMap((info) => Object.entries(info.redirects)));
  const follow = (specifier: string): string => redirects.get(specifier) ?? specifier;
  const sources = await Promise.all(modules.map(async ({ specifier, local }): Promise<Array<[string, string]>> => {
    if (typeof local === "string") {
      return [[remotePath(specifier), await Deno.readTextFile(local)]];
    }
    return [];
  }));
  return {
    dependencies: new Map(modules.map((module) => [
      module.specifier,
      new Map(module.dependencies.map((dependency) => [dependency.specifier, follow(targetOf(dependency))])),
    ])),
    sources: new Map(sources.flat()),
  };
}

function specifierOf(fileName: string): string {
  if (fileName.startsWith(REMOTE_ROOT)) {
    return `https://${fileName.slice(REMOTE_ROOT.length)}`;
  }
  return new URL(`file://${fileName}`).href;
}

function compilerHost(options: ts.CompilerOptions, graph: Graph, denoTypes: string): ts.CompilerHost {
  const host = ts.createCompilerHost(options);
  const sources = new Map(graph.sources).set(DENO_TYPES, denoTypes);
  const resolve = (text: string, containingFile: string): ts.ResolvedModuleWithFailedLookupLocations => {
    const target = graph.dependencies.get(specifierOf(containingFile))?.get(text);
    if (target?.startsWith("file:") === true) {
      return { resolvedModule: { extension: ts.Extension.Ts, resolvedFileName: new URL(target).pathname } };
    }
    if (target?.startsWith("https:") === true) {
      return { resolvedModule: { extension: ts.Extension.Ts, resolvedFileName: remotePath(target) } };
    }
    return ts.resolveModuleName(text, containingFile, options, host);
  };
  return {
    ...host,
    getSourceFile: (fileName, languageVersion) => {
      const text = sources.get(fileName);
      if (typeof text === "string") {
        return ts.createSourceFile(fileName, text, languageVersion);
      }
      return host.getSourceFile(fileName, languageVersion);
    },
    resolveModuleNameLiterals: (literals, containingFile) =>
      literals.map((literal) => resolve(literal.text, containingFile)),
  };
}

function typeArguments(type: ts.Type & Pick<ts.TypeReference, "typeArguments">): readonly ts.Type[] {
  return type.typeArguments ?? [];
}

function reachesAny(type: ts.Type, seen: Set<ts.Type>): boolean {
  if (seen.has(type)) {
    return false;
  }
  seen.add(type);
  if (type.flags === ts.TypeFlags.Any) {
    return !("intrinsicName" in type && type.intrinsicName === "error");
  }
  return (type.isUnionOrIntersection() && type.types.some((part) => reachesAny(part, seen))) ||
    [...typeArguments(type), ...(type.aliasTypeArguments ?? [])].some((part) => reachesAny(part, seen));
}

function hasAny(type: ts.Type): boolean {
  const verdict = verdicts.get(type) ?? reachesAny(type, new Set());
  verdicts.set(type, verdict);
  return verdict;
}

function holdsThenable(checker: ts.TypeChecker, type: ts.Type, node: ts.Node): boolean {
  if (type.isUnion()) {
    return type.types.some((part) => holdsThenable(checker, part, node));
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    return typeArguments(type).some((element) => holdsThenable(checker, element, node));
  }
  const then = type.getProperty("then");
  if (!then) {
    return false;
  }
  return checker.getTypeOfSymbolAtLocation(then, node).getCallSignatures().length > NONE;
}

function isValue(node: ts.Node): boolean {
  return !KEYWORD_LITERALS.has(node.kind) && !ts.isLiteralExpression(node) &&
    (ts.isIdentifier(node) || ts.isExpression(node));
}

function walked(sources: readonly ts.SourceFile[]): { expressions: ts.ExpressionStatement[]; values: ts.Node[] } {
  const expressions: ts.ExpressionStatement[] = [];
  const values: ts.Node[] = [];
  const visit = (node: ts.Node, typed: boolean): void => {
    if (ts.isExpressionStatement(node)) {
      expressions.push(node);
    }
    if (!typed && isValue(node)) {
      values.push(node);
    }
    ts.forEachChild(node, (child) => {
      visit(child, typed || ts.isTypeNode(child));
    });
  };
  for (const file of sources) {
    ts.forEachChild(file, (child) => {
      visit(child, ts.isTypeNode(child));
    });
  }
  return { expressions, values };
}

function site(root: string, node: ts.Node): Site {
  const file = node.getSourceFile();
  const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
  const text = node.getText(file).replace(/\n[\s\S]*/u, "").slice(TEXT_START, SITE_TEXT);
  return { column: character + ONE_BASED, file: file.fileName.slice(`${root}/`.length), line: line + ONE_BASED, text };
}

function diagnosticText(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  if (!diagnostic.file || typeof diagnostic.start !== "number") {
    return message;
  }
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${String(line + ONE_BASED)}:${String(character + ONE_BASED)} ${message}`;
}

async function readConfig(root: string): Promise<Pick<ts.ParsedCommandLine, "errors" | "fileNames" | "options">> {
  const config = denoConfig.parse(parseJson(await Deno.readTextFile(`${root}/deno.json`)));
  const { types, ...compilerOptions } = config.compilerOptions;
  const converted = ts.convertCompilerOptionsFromJson(compilerOptions, root);
  const options: ts.CompilerOptions = {
    ...converted.options,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    types: [],
  };
  return { errors: converted.errors, fileNames: types, options };
}

async function checkedProgram(root: string, files: readonly string[]): Promise<[ts.TypeChecker, ts.SourceFile[]]> {
  const config = await readConfig(root);
  const paths = files.map((file) => `${root}/${file}`);
  const [graph, denoTypes] = await Promise.all([moduleGraph(root, paths), deno(root, ["types"])]);
  const program = ts.createProgram({
    host: compilerHost(config.options, graph, denoTypes.replaceAll(DENO_LIB_REFERENCE, "")),
    options: config.options,
    rootNames: [DENO_TYPES, ...config.fileNames.map((file) => `${root}/${file}`), ...paths],
  });
  const sources = paths.map((path) => program.getSourceFile(path)).filter((file) => typeof file === "object");
  const diagnostics = [
    ...config.errors,
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...sources.flatMap((file) => [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)]),
  ];
  if (diagnostics.length > NONE) {
    const texts = diagnostics.map((diagnostic) => diagnosticText(diagnostic));
    throw new Error(`The type coverage program has errors that deno check does not.\n${texts.join("\n")}`);
  }
  return [program.getTypeChecker(), sources];
}

function unvoided(expression: ts.Expression): ts.Expression {
  if (ts.isVoidExpression(expression)) {
    return expression.expression;
  }
  return expression;
}

async function typeCoverage(root: string, files: readonly string[]): Promise<Report> {
  const [checker, sources] = await checkedProgram(root, files);
  const { expressions, values } = walked(sources);
  const floating = expressions.filter(({ expression }) => {
    const value = unvoided(expression);
    return holdsThenable(checker, checker.getTypeAtLocation(value), value);
  });
  return {
    checked: values.length,
    floating: floating.map(({ expression }) => site(root, expression)),
    statements: expressions.length,
    uncovered: values.filter((node) => hasAny(checker.getTypeAtLocation(node))).map((node) => site(root, node)),
  };
}

function located({ file, line, column, text }: Site): string {
  return `${file}:${String(line)}:${String(column)} ${text}`;
}

function percentCovered({ checked, uncovered }: Report): number {
  if (checked === NONE) {
    return FULL;
  }
  return ((checked - uncovered.length) / checked) * FULL;
}

function summary(report: Report): string {
  const { checked, uncovered, statements, floating } = report;
  const percent = percentCovered(report).toFixed(PERCENT_DECIMALS);
  return [
    ...uncovered.map((value) => located(value)),
    `Type coverage is ${percent}%. ${String(uncovered.length)} of ${
      String(checked)
    } values have a type that contains any.`,
    ...floating.map((value) => located(value)),
    `${String(floating.length)} of ${String(statements)} expression statements leave a promise that no code awaits.`,
  ].join("\n");
}

if (import.meta.main) {
  const report = await typeCoverage(Deno.cwd(), Deno.args);
  await Deno.stdout.write(new TextEncoder().encode(`${summary(report)}\n`));
  Deno.exitCode = Number(report.uncovered.length > NONE || report.floating.length > NONE);
}

export { summary, typeCoverage };
export type { Report, Site };
