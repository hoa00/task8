import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildImportGraph, cyclicEdges, sourceFiles } from './import-graph.mjs';

const LEGACY_CEILING_HASH = '309a039f859db8ebb4b27a8163cfe3a6c738f557db90642abe6b8579a1ad3bcf';
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

export function enforceAllowlist(violations, allowlist, ceiling) {
  const key = (row) => `${row.rule}:${row.edge}`;
  assert.equal(new Set(allowlist.map(key)).size, allowlist.length, 'Duplicate allowlist entry');
  const actual = new Set(violations.map(key));
  const allowed = new Set(allowlist.map(key));
  for (const row of allowlist) {
    if (ceiling) assert(ceiling.includes(key(row)), `Allowlist expansion: ${key(row)}`);
    assert(
      /^FR-0[345]$/.test(row.removeIn) && row.reason?.length > 15,
      'Allowlist needs reason and removal phase',
    );
    assert(actual.has(key(row)), `Stale allowlist: ${key(row)}`);
  }
  const unexpected = violations.filter((row) => !allowed.has(key(row)));
  assert.deepEqual(unexpected, [], 'New frontend dependency violation');
  return { status: 'passed', legacyEdges: allowlist.length, violations: [] };
}
export function checkFrontend() {
  const policy = JSON.parse(
    readFileSync(new URL('./frontend-policy.json', import.meta.url), 'utf8'),
  );
  const allowlist = JSON.parse(
    readFileSync(new URL('./frontend-legacy.json', import.meta.url), 'utf8'),
  );
  const baseline = readFileSync(new URL('./frontend-legacy-ceiling.json', import.meta.url));
  assert.equal(
    createHash('sha256').update(baseline).digest('hex'),
    LEGACY_CEILING_HASH,
    'Frozen legacy ceiling changed',
  );
  const files = sourceFiles(`${root}apps/web/src/features`)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => file.slice(root.length));
  validateRoles(files, policy);
  const edges = buildImportGraph(root);
  return {
    ...enforceAllowlist(inspectFrontend(edges, policy), allowlist, JSON.parse(baseline)),
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
