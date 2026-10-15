import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const sourceRoots = [
  'apps/web/src',
  'packages/ui/src',
  'packages/contracts/src',
  'packages/domain/src',
];
export const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.(?:tsx?|mjs)$/.test(file) && !/(?:routeTree\.gen|\.test)\.(?:tsx?|mjs)$/.test(file)
        ? [file]
        : [];
  });

export function parseImports(filename, text) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const edges = [];
  function add(value, kind, symbols, typeOnly = false) {
    assert(
      value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)),
      `${filename}: ${kind} requires a static module specifier`,
    );
    edges.push({ specifier: value.text, kind, symbols: [...new Set(symbols)].sort(), typeOnly });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const symbols = clause
        ? [
            ...(clause.name ? ['default'] : []),
            ...(bindings && ts.isNamedImports(bindings)
              ? bindings.elements.map((e) => (e.propertyName ?? e.name).text)
              : bindings
                ? ['*']
                : []),
          ]
        : ['<side-effect>'];
      add(
        node.moduleSpecifier,
        'import',
        symbols,
        clause?.isTypeOnly ||
          !!(
            bindings &&
            ts.isNamedImports(bindings) &&
            !clause.name &&
            bindings.elements.length &&
            bindings.elements.every((e) => e.isTypeOnly)
          ),
      );
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(
        node.moduleSpecifier,
        'export',
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements.map((e) => (e.propertyName ?? e.name).text)
          : ['*'],
        node.isTypeOnly,
      );
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression, 'require', ['*'], node.isTypeOnly);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, 'import-type', [node.qualifier?.getText(source) ?? '*'], true);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      add(
        node.arguments[0],
        node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic' : 'require',
        ['*'],
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return edges;
}

export function resolveImport(root, filename, specifier) {
  let target;
  if (specifier === '#studio-adapter')
    target = path.join(root, 'apps/web/src/data/adapters/mock-entry.ts');
  else
    target = ts.resolveModuleName(
      specifier,
      filename,
      {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        module: ts.ModuleKind.ESNext,
        resolveJsonModule: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
      ts.sys,
    ).resolvedModule?.resolvedFileName;
  if (!target && specifier.startsWith('.')) {
    const base = path.resolve(path.dirname(filename), specifier);
    target = [
      base,
      ...['.ts', '.tsx', '.mjs', '.json', '/index.ts', '/index.tsx'].map((ext) => base + ext),
    ].find((file) => existsSync(file) && !ts.sys.directoryExists(file));
    assert(target, `${filename}: unresolved relative import ${specifier}`);
  }
  if (!target) return null;
  return path.relative(root, realpathSync(target)).split(path.sep).join('/');
}

export function buildImportGraph(root, roots = sourceRoots) {
  return roots
    .flatMap((directory) => sourceFiles(path.join(root, directory)))
    .flatMap((filename) =>
      parseImports(filename, readFileSync(filename, 'utf8')).map((edge) => ({
        ...edge,
        from: path.relative(root, filename).split(path.sep).join('/'),
        to: resolveImport(root, filename, edge.specifier),
      })),
    );
}

export function cyclicEdges(edges) {
  const graph = new Map();
  for (const { from, to, typeOnly } of edges)
    if (to && !typeOnly && !to.includes('node_modules/')) {
      if (!graph.has(from)) graph.set(from, []);
      graph.get(from).push(to);
    }
  let next = 0;
  const index = new Map(),
    low = new Map(),
    stack = [],
    active = new Set(),
    component = new Map(),
    sizes = [];
  function visit(node) {
    index.set(node, next);
    low.set(node, next++);
    stack.push(node);
    active.add(node);
    for (const target of graph.get(node) ?? []) {
      if (!index.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node), low.get(target)));
      } else if (active.has(target)) low.set(node, Math.min(low.get(node), index.get(target)));
    }
    if (low.get(node) === index.get(node)) {
      const id = sizes.length;
      let count = 0,
        target;
      do {
        target = stack.pop();
        active.delete(target);
        component.set(target, id);
        count++;
      } while (target !== node);
      sizes.push(count);
    }
  }
  for (const node of graph.keys()) if (!index.has(node)) visit(node);
  return edges.filter(
    (e) =>
      e.to &&
      !e.typeOnly &&
      component.has(e.from) &&
      component.get(e.from) === component.get(e.to) &&
      (sizes[component.get(e.from)] > 1 || e.from === e.to),
  );
}
