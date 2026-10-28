import ts from "typescript";
import { z } from "zod";

export type Site = { readonly file: string; readonly line: number; readonly column: number; readonly text: string };
export type Report = {
  readonly checked: number;
  readonly uncovered: readonly Site[];
  readonly statements: number;
  readonly floating: readonly Site[];
};

const REMOTE_ROOT = "/deno-remote/";
const DENO_TYPES = "/deno-types/lib.deno.d.ts";
const SITE_TEXT = 80;
const SET_PARENT_NODES = true;
const LITERALS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
]);

const resolved = z.object({ specifier: z.string() });
const denoInfo = z.object({
  modules: z.array(z.object({
    specifier: z.string(),
    local: z.string().optional(),
    dependencies: z.array(z.union([
      z.object({ specifier: z.string(), type: resolved }),
      z.object({ specifier: z.string(), code: resolved }),
    ])).default([]),
  })),
  redirects: z.record(z.string(), z.string()),
});
const denoConfig = z.object({
  compilerOptions: z.looseObject({ types: z.array(z.string()).default([]) }),
});

type Graph = {
  readonly local: ReadonlyMap<string, string>;
  readonly dependencies: ReadonlyMap<string, ReadonlyMap<string, string>>;
};

async function deno(root: string, args: readonly string[]): Promise<string> {
  const output = await new Deno.Command(Deno.execPath(), { args: [...args], cwd: root, stderr: "inherit" }).output();
  if (!output.success) throw new Error(`deno ${String(args[0])} failed with exit code ${String(output.code)}.`);
  return new TextDecoder().decode(output.stdout);
}

async function moduleGraph(root: string, files: readonly string[]): Promise<Graph> {
  const infos = await Promise.all(
    files.map(async (file) => denoInfo.parse(JSON.parse(await deno(root, ["info", "--json", file])))),
  );
  const modules = infos.flatMap((info) => info.modules);
  const redirects = new Map(infos.flatMap((info) => Object.entries(info.redirects)));
  const follow = (specifier: string): string => redirects.get(specifier) ?? specifier;
  return {
    local: new Map(modules.flatMap(({ specifier, local }) => local === undefined ? [] : [[specifier, local]])),
    dependencies: new Map(modules.map((module) => [
      module.specifier,
      new Map(module.dependencies.map((dependency) => [
        dependency.specifier,
        follow("type" in dependency ? dependency.type.specifier : dependency.code.specifier),
      ])),
    ])),
  };
}

function remotePath(specifier: string): string {
  return `${REMOTE_ROOT}${specifier.replace(/^https:\/\//, "")}`;
}

function specifierOf(fileName: string): string {
  return fileName.startsWith(REMOTE_ROOT)
    ? `https://${fileName.slice(REMOTE_ROOT.length)}`
    : new URL(`file://${fileName}`).href;
}

function compilerHost(options: ts.CompilerOptions, graph: Graph, denoTypes: string): ts.CompilerHost {
  const host = ts.createCompilerHost(options);
  const remote = new Map([...graph.local].map(([specifier, local]) => [remotePath(specifier), local]));
  const virtual = (fileName: string): string | undefined => {
    if (fileName === DENO_TYPES) return denoTypes;
    const local = remote.get(fileName);
    return local === undefined ? undefined : Deno.readTextFileSync(local);
  };
  const resolve = (text: string, containingFile: string): ts.ResolvedModuleWithFailedLookupLocations => {
    const target = graph.dependencies.get(specifierOf(containingFile))?.get(text);
    if (target?.startsWith("file:") === true) {
      return { resolvedModule: { resolvedFileName: new URL(target).pathname, extension: ts.Extension.Ts } };
    }
    if (target?.startsWith("https:") === true) {
      return { resolvedModule: { resolvedFileName: remotePath(target), extension: ts.Extension.Ts } };
    }
    return ts.resolveModuleName(text, containingFile, options, host);
  };
  return {
    ...host,
    fileExists: (fileName) => virtual(fileName) !== undefined || host.fileExists(fileName),
    readFile: (fileName) => virtual(fileName) ?? host.readFile(fileName),
    getSourceFile: (fileName, languageVersion) => {
      const text = virtual(fileName);
      return text === undefined
        ? host.getSourceFile(fileName, languageVersion)
        : ts.createSourceFile(fileName, text, languageVersion, SET_PARENT_NODES, ts.ScriptKind.TS);
    },
    resolveModuleNameLiterals: (literals, containingFile) =>
      literals.map((literal) => resolve(literal.text, containingFile)),
  };
}

function isTypeReference(type: ts.Type): type is ts.TypeReference {
  return "objectFlags" in type && typeof type.objectFlags === "number" &&
    (type.objectFlags & ts.ObjectFlags.Reference) !== 0;
}

function isErrorType(type: ts.Type): boolean {
  return "intrinsicName" in type && type.intrinsicName === "error";
}

function anyFinder(checker: ts.TypeChecker): (type: ts.Type) => boolean {
  const verdicts = new Map<ts.Type, boolean>();
  const reachesAny = (type: ts.Type, seen: Set<ts.Type>): boolean => {
    if (seen.has(type)) return false;
    seen.add(type);
    if ((type.flags & ts.TypeFlags.Any) !== 0) return !isErrorType(type);
    const parts = [
      ...(type.isUnionOrIntersection() ? type.types : []),
      ...(isTypeReference(type) ? checker.getTypeArguments(type) : []),
      ...(type.aliasTypeArguments ?? []),
    ];
    return parts.some((part) => reachesAny(part, seen));
  };
  return (type) => {
    const known = verdicts.get(type);
    if (known !== undefined) return known;
    const verdict = reachesAny(type, new Set());
    verdicts.set(type, verdict);
    return verdict;
  };
}

function holdsThenable(checker: ts.TypeChecker, type: ts.Type, node: ts.Node): boolean {
  return (type.isUnion() ? type.types : [type]).some((part) => {
    if (isTypeReference(part) && (checker.isArrayType(part) || checker.isTupleType(part))) {
      return checker.getTypeArguments(part).some((element) => holdsThenable(checker, element, node));
    }
    const then = part.getProperty("then");
    return then !== undefined && checker.getTypeOfSymbolAtLocation(then, node).getCallSignatures().length > 0;
  });
}

function expressionStatements(file: ts.SourceFile): ts.ExpressionStatement[] {
  const statements: ts.ExpressionStatement[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isExpressionStatement(node)) statements.push(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
  return statements;
}

function valueNodes(file: ts.SourceFile): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeNode(node)) return;
    if (!LITERALS.has(node.kind) && (ts.isIdentifier(node) || ts.isExpression(node))) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
  return nodes;
}

function site(file: ts.SourceFile, name: string, node: ts.Node): Site {
  const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
  const text = node.getText(file).replace(/\n[\s\S]*/, "").slice(0, SITE_TEXT);
  return { file: name, line: line + 1, column: character + 1, text };
}

function diagnosticText(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  if (diagnostic.file === undefined || diagnostic.start === undefined) return message;
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${String(line + 1)}:${String(character + 1)} ${message}`;
}

export async function typeCoverage(root: string, files: readonly string[]): Promise<Report> {
  const config = denoConfig.parse(JSON.parse(await Deno.readTextFile(`${root}/deno.json`)));
  const { types, ...compilerOptions } = config.compilerOptions;
  const converted = ts.convertCompilerOptionsFromJson(compilerOptions, root);
  const options: ts.CompilerOptions = {
    ...converted.options,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  };
  const paths = files.map((file) => `${root}/${file}`);
  const [graph, denoTypes] = await Promise.all([moduleGraph(root, paths), deno(root, ["types"])]);
  const program = ts.createProgram({
    rootNames: [DENO_TYPES, ...types.map((file) => `${root}/${file}`), ...paths],
    options,
    host: compilerHost(options, graph, denoTypes.replaceAll(/^\/\/\/ <reference lib="deno\.[^"]+" \/>$/gm, "")),
  });
  const sources = paths.map((path) => program.getSourceFile(path)).filter((file) => file !== undefined);
  const diagnostics = [
    ...converted.errors,
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...sources.flatMap((file) => [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)]),
  ];
  if (diagnostics.length > 0) {
    throw new Error(
      `The type coverage program has errors that deno check does not.\n${diagnostics.map(diagnosticText).join("\n")}`,
    );
  }
  const checker = program.getTypeChecker();
  const hasAny = anyFinder(checker);
  let checked = 0;
  let statements = 0;
  const floating: Site[] = [];
  const uncovered = sources.flatMap((file) => {
    const nodes = valueNodes(file);
    const expressions = expressionStatements(file);
    checked += nodes.length;
    statements += expressions.length;
    const name = file.fileName.slice(root.length + 1);
    for (const { expression } of expressions) {
      const value = ts.isVoidExpression(expression) ? expression.expression : expression;
      if (holdsThenable(checker, checker.getTypeAtLocation(value), value)) floating.push(site(file, name, expression));
    }
    return nodes.filter((node) => hasAny(checker.getTypeAtLocation(node))).map((node) => site(file, name, node));
  });
  return { checked, uncovered, statements, floating };
}

function located({ file, line, column, text }: Site): string {
  return `${file}:${String(line)}:${String(column)} ${text}`;
}

export function summary({ checked, uncovered, statements, floating }: Report): string {
  const percent = checked === 0 ? 100 : ((checked - uncovered.length) / checked) * 100;
  return [
    ...uncovered.map(located),
    `Type coverage is ${percent.toFixed(2)}%. ${String(uncovered.length)} of ${
      String(checked)
    } values have a type that contains any.`,
    ...floating.map(located),
    `${String(floating.length)} of ${String(statements)} expression statements leave a promise that no code awaits.`,
  ].join("\n");
}

if (import.meta.main) {
  const report = await typeCoverage(Deno.cwd(), Deno.args);
  console.log(summary(report));
  if (report.uncovered.length > 0 || report.floating.length > 0) Deno.exitCode = 1;
}
