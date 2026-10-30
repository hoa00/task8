import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const api = fileURLToPath(new URL('../', import.meta.url));
// Public facades are explicit contracts; deeper implementation paths remain private.
const publicFacades = new Set([
  'src/modules/auth/http/index.ts',
  'src/modules/auth/authority.ts',
  'src/modules/auth/storage/index.ts',
  'src/modules/tasks/subtask-routes.ts',
  'src/modules/projects/personal-routes.ts',
  'src/modules/projects/access.ts',
  'src/modules/tasks/aggregate.ts',
  'src/modules/files/plans.ts',
  'src/modules/files/projections.ts',
  'src/modules/comments/projections.ts',
  'src/modules/tasks/projections.ts',
  'src/modules/projects/projections.ts',
  'src/modules/members/projections.ts',
  'src/modules/teams/projections.ts',
  'src/modules/workspaces/projections.ts',
  'src/modules/notifications/visibility.ts',
]);
const isPublicEntry = (path) =>
  /^src\/modules\/[^/]+\/(index|routes)\.ts$/.test(path) || publicFacades.has(path);
const layers = {
  http: new Set(['http', 'application', 'shared', 'context']),
  application: new Set([
    'application',
    'domain',
    'policy',
    'mapper',
    'persistence',
    'storage',
    'db',
    'shared',
  ]),
  domain: new Set(['domain', 'policy', 'shared']),
  policy: new Set(['domain', 'policy', 'shared']),
  mapper: new Set(['domain', 'mapper', 'shared']),
  persistence: new Set(['domain', 'policy', 'persistence', 'db', 'shared']),
  storage: new Set(['storage', 'domain', 'shared']),
  db: new Set(['db', 'shared']),
  shared: new Set(['shared']),
  composition: new Set([
    'composition',
    'http',
    'application',
    'shared',
    'db',
    'storage',
    'context',
  ]),
  context: new Set(['context', 'db', 'storage', 'application', 'shared']),
};
const pureLayers = new Set(['domain', 'policy', 'mapper', 'shared']);
const packageName = (name) =>
  name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0];

export function classify(path) {
  const parts = path.replace(/^src\//, '').split('/');
  if (parts[0] === 'modules') {
    const file = parts.at(-1);
    const owner = parts[1];
    const layer =
      file === 'index.ts' && parts.length === 3
        ? 'application'
        : file === 'routes.ts' || file.endsWith('-routes.ts')
          ? 'http'
          : file === 'mapper.ts'
            ? 'mapper'
            : (Object.keys(layers).find((name) => parts.includes(name)) ?? 'application');
    return { owner, layer };
  }
  if (parts[0] === 'db' || parts[0] === 'storage' || parts[0] === 'shared' || parts[0] === 'http')
    return { owner: null, layer: parts[0] };
  return {
    owner: null,
    layer:
      parts[0] === 'index.ts' || parts[0] === 'app.ts'
        ? 'composition'
        : parts[0] === 'runtime.ts'
          ? 'context'
          : parts[0] === 'middleware.ts'
            ? 'http'
            : 'shared',
  };
}

export function importsOf(path, content) {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const imports = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      imports.push(
        ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '<dynamic>',
      );
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(source) === 'require')
    )
      imports.push(
        node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
          ? node.arguments[0].text
          : '<dynamic>',
      );
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

function publicLayers(files, from, specifier, target, seen = new Set()) {
  if (seen.has(target)) return [classify(target).layer];
  if (!isPublicEntry(target)) return [classify(target).layer];
  const source = ts.createSourceFile(from, files.get(from), ts.ScriptTarget.Latest, true);
  const imports = source.statements.filter(
    (node) =>
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier?.text === specifier,
  );
  const symbols = imports.flatMap((node) => {
    const bindings = ts.isImportDeclaration(node)
      ? node.importClause?.namedBindings
      : node.exportClause;
    return bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))
      ? bindings.elements.map((element) => (element.propertyName ?? element.name).text)
      : [];
  });
  if (!symbols.length) return [classify(target).layer];
  const facade = ts.createSourceFile(target, files.get(target), ts.ScriptTarget.Latest, true);
  return symbols.flatMap((symbol) => {
    const declaration = facade.statements.find(
      (node) =>
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.some((element) => element.name.text === symbol),
    );
    if (!declaration) return [classify(target).layer];
    const leaf = relative(
      api,
      resolve(api, dirname(target), declaration.moduleSpecifier.text),
    ).replaceAll('\\', '/');
    if (!files.has(leaf)) return [classify(target).layer];
    return publicLayers(
      files,
      target,
      declaration.moduleSpecifier.text,
      leaf,
      new Set([...seen, target]),
    );
  });
}

export function inspectBoundaries(files) {
  const violations = [];
  const graph = new Map([...files.keys()].map((path) => [path, new Set()]));
  const add = (from, to, rule) => violations.push({ from, to, rule });
  for (const [from, content] of files) {
    const source = classify(from);
    if (/^src\/modules\/[^/]+\.ts$/.test(from)) add(from, from, 'feature-owner');
    for (const specifier of importsOf(from, content)) {
      if (specifier === '<dynamic>') {
        add(from, specifier, 'static-import');
        continue;
      }
      if (!specifier.startsWith('.')) {
        const dependency = packageName(specifier);
        if (
          ![
            '@studio/contracts',
            '@studio/domain',
            'hono',
            'zod',
            'drizzle-orm',
            '@hoa00/i24h-auth-honojs',
            'openid-client',
            'jose',
          ].includes(dependency)
        )
          add(from, specifier, 'external-dependency');
        if (
          (['openid-client', 'jose'].includes(dependency) &&
            from !== 'src/modules/auth/http/oidc-provider.ts') ||
          (pureLayers.has(source.layer) && ['hono', 'drizzle-orm'].includes(dependency)) ||
          (source.layer !== 'http' &&
            source.layer !== 'composition' &&
            source.layer !== 'context' &&
            ['hono', '@hoa00/i24h-auth-honojs'].includes(dependency)) ||
          (dependency === '@hoa00/i24h-auth-honojs' &&
            !['src/modules/auth/http/access.ts'].includes(from))
        )
          add(from, specifier, 'layer');
        continue;
      }
      const target = relative(api, resolve(api, dirname(from), specifier)).replaceAll('\\', '/');
      if (!target.startsWith('src/') || /(?:^|\/)(tests|web)(?:\/|$)/.test(target)) {
        add(from, target, 'source-scope');
        continue;
      }
      if (!files.has(target)) {
        add(from, target, 'unresolved-import');
        continue;
      }
      graph.get(from).add(target);
      const destination = classify(target);
      if (destination.owner && source.owner !== destination.owner && !isPublicEntry(target))
        add(from, target, 'public-entry');
      if (
        !layers[source.layer]?.has(destination.layer) &&
        publicLayers(files, from, specifier, target).some(
          (layer) => !layers[source.layer]?.has(layer),
        )
      )
        add(from, target, 'layer');
      if (
        !source.owner &&
        destination.owner &&
        source.layer !== 'http' &&
        source.layer !== 'composition' &&
        source.layer !== 'context'
      )
        add(from, target, 'primitive-owner');
    }
  }
  // Tarjan SCC catches cycles without exponential path enumeration.
  let next = 0;
  const indices = new Map(),
    low = new Map(),
    stack = [],
    active = new Set(),
    cycles = [];
  function visit(node) {
    indices.set(node, next);
    low.set(node, next++);
    stack.push(node);
    active.add(node);
    for (const target of graph.get(node)) {
      if (!indices.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node), low.get(target)));
      } else if (active.has(target)) low.set(node, Math.min(low.get(node), indices.get(target)));
    }
    if (low.get(node) === indices.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        active.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || graph.get(node).has(node)) {
        const paths = component.sort();
        const edges = paths
          .flatMap((from) =>
            [...graph.get(from)].filter((to) => paths.includes(to)).map((to) => [from, to]),
          )
          .sort();
        cycles.push({ paths, edges });
      }
    }
  }
  for (const node of graph.keys()) if (!indices.has(node)) visit(node);
  return { violations, cycles };
}
const key = (row) => JSON.stringify([row.from, row.to, row.rule]);
export function checkBoundaries(
  files = readSources(),
  allowlist = JSON.parse(readFileSync(resolve(api, 'tooling/legacy-imports.json'), 'utf8')),
) {
  const result = inspectBoundaries(files);
  const allowed = new Set(allowlist.imports.map(key));
  for (const row of [...allowlist.imports, ...allowlist.cycles]) {
    if (!/^BR-0[2-8][AB]?$/.test(row.removeIn) || JSON.stringify(row).includes('*'))
      throw new Error('Invalid finite legacy exemption');
  }
  const unexpected = result.violations.filter((row) => !allowed.has(key(row)));
  const stale = allowlist.imports.filter(
    (row) => !result.violations.some((actual) => key(row) === key(actual)),
  );
  const unexpectedCycles = result.cycles.filter(
    (paths) =>
      !allowlist.cycles.some(
        (row) => JSON.stringify({ paths: row.paths, edges: row.edges }) === JSON.stringify(paths),
      ),
  );
  const staleCycles = allowlist.cycles.filter(
    (row) =>
      !result.cycles.some(
        (paths) => JSON.stringify({ paths: row.paths, edges: row.edges }) === JSON.stringify(paths),
      ),
  );
  if (unexpected.length || stale.length || unexpectedCycles.length || staleCycles.length)
    throw new Error(JSON.stringify({ unexpected, stale, unexpectedCycles, staleCycles }, null, 2));
  if (allowed.size || allowlist.cycles.length)
    throw new Error('Legacy exemptions are closed after BR-08');
  return {
    status: 'PASS',
    sourceFiles: files.size,
    legacyImports: allowed.size,
    legacyCycles: allowlist.cycles.length,
  };
}
export function readSources() {
  const walk = (directory) =>
    readdirSync(resolve(api, directory), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? entry.name === 'migrations'
          ? []
          : walk(directory + '/' + entry.name)
        : entry.name.endsWith('.ts') || entry.name.endsWith('.wasm')
          ? [directory + '/' + entry.name]
          : [],
    );
  return new Map(
    walk('src').map((path) => [
      path,
      path.endsWith('.wasm') ? '' : readFileSync(resolve(api, path), 'utf8'),
    ]),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(checkBoundaries()));
