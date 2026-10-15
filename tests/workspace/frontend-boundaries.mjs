import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fieldBindingViolations } from './frontend-fields.mjs';
import { buildImportGraph, cyclicEdges, sourceFiles } from './import-graph.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const feature = (file) => file?.match(/^apps\/web\/src\/features\/([^/]+)\//)?.[1];
export const edgeKey = (edge) =>
  `${edge.from}|${edge.to && !edge.to.includes('node_modules/') ? edge.to : edge.specifier}|${edge.kind}|${edge.symbols.join(',')}`;

export function inspectFrontend(edges, policy) {
  const violations = [];
  const views = new Set(policy.views);
  const publicSurfaces = new Map(
    policy.publicSurfaces.map((row) => [row.path, new Set(row.symbols)]),
  );
  for (const edge of edges) {
    const { from, to, specifier } = edge;
    const rules = [];
    if (from.startsWith('apps/web/src/data/mock/') && to?.endsWith('/mock/task-fields.ts'))
      rules.push('mock-compat-import');
    if (from.endsWith('/mock/primitives.ts') && to?.startsWith('apps/web/src/data/mock/'))
      rules.push('mock-primitive-direction');
    if (from.startsWith('apps/web/src/')) {
      if (to?.startsWith('packages/') && specifier.startsWith('.'))
        rules.push('web-package-private');
      if (specifier.startsWith('@studio/')) {
        const name = specifier.split('/')[1];
        if (['ui', 'contracts', 'domain'].includes(name)) {
          const pkg = JSON.parse(
            readFileSync(new URL(`../../packages/${name}/package.json`, import.meta.url), 'utf8'),
          );
          const base = `@studio/${name}`;
          const subpath = specifier === base ? '.' : `.${specifier.slice(base.length)}`;
          if (!Object.hasOwn(pkg.exports, subpath)) rules.push('web-package-private');
        }
      }
      if (
        to?.startsWith('apps/api/') ||
        /^(?:@studio\/api|hono|drizzle-orm|cloudflare:|node:)/.test(specifier)
      )
        rules.push('web-server');
      if (
        from.startsWith('apps/web/src/data/') &&
        ((to && /^apps\/web\/src\/(?:features|routes|app)\//.test(to)) ||
          /^(?:@studio\/ui|@tanstack\/react-router|react-dom)(?:\/|$)/.test(specifier))
      )
        rules.push('data-presentation');
      if (views.has(from) && !edge.typeOnly && policy.roles[to] === 'controller')
        rules.push('view-controller');
      if (
        views.has(from) &&
        (to?.startsWith('apps/web/src/data/') ||
          /^(?:@tanstack\/react-(?:query|router))(?:\/|$)/.test(specifier))
      )
        rules.push('view-data');
      if (feature(from) && feature(to) && feature(from) !== feature(to)) {
        const symbols = publicSurfaces.get(to);
        if (!symbols || !edge.symbols.every((symbol) => symbols.has(symbol)))
          rules.push('feature-private');
      }
    }
    for (const rule of rules) violations.push({ rule, edge: edgeKey(edge) });
  }
  for (const edge of cyclicEdges(edges)) violations.push({ rule: 'cycle', edge: edgeKey(edge) });
  return violations;
}

export function enforceFrontend(violations) {
  assert.deepEqual(violations, [], 'Frontend dependency violation');
  return { status: 'passed', legacyEdges: 0, violations: [] };
}
export function checkFrontend() {
  const policy = JSON.parse(
    readFileSync(new URL('./frontend-policy.json', import.meta.url), 'utf8'),
  );
  const files = sourceFiles(`${root}apps/web/src/features`)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => file.slice(root.length));
  validateRoles(files, policy);
  const bindingErrors = sourceFiles(`${root}apps/web/src`)
    .filter((file) => file.endsWith('.tsx'))
    .flatMap((file) => fieldBindingViolations(file.slice(root.length), readFileSync(file, 'utf8')));
  assert.deepEqual(bindingErrors, [], 'Every Field must forward its generated control bindings');
  const edges = buildImportGraph(root);
  return {
    ...enforceFrontend(inspectFrontend(edges, policy)),
    edges: edges.length,
  };
}
export function validateRoles(files, policy) {
  assert.deepEqual(
    Object.keys(policy.roles).sort(),
    [...files].sort(),
    'Every feature TSX needs an explicit controller/view role',
  );
  assert(
    Object.values(policy.roles).every((role) => ['controller', 'view'].includes(role)),
    'Invalid feature role',
  );
  assert.deepEqual(
    [...policy.views].sort(),
    Object.entries(policy.roles)
      .filter(([, role]) => role === 'view')
      .map(([file]) => file)
      .sort(),
    'View role inventory drift',
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(checkFrontend()));
