import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseImports, resolveImport, cyclicEdges } from './import-graph.mjs';
import { validatePackageEdge, validateImport } from './boundaries.mjs';
import {
  inspectFrontend,
  enforceAllowlist,
  validateRoles,
  checkFrontend,
} from './frontend-boundaries.mjs';

const edge = (from, to, symbols = ['Thing']) => ({
  from,
  to,
  symbols,
  specifier: './Thing',
  kind: 'import',
  typeOnly: false,
});
const policy = {
  views: ['apps/web/src/features/tasks/Row.tsx'],
  publicSurfaces: [{ path: 'apps/web/src/features/people/index.ts', symbols: ['MemberIdentity'] }],
};

test('one parser and resolver protect static/re-export/dynamic/require/import-type paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'frontend-import-'));
  try {
    for (const dir of ['packages/ui/src', 'packages/domain/src', 'apps/web/src'])
      mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, 'apps/web/src/private.ts'), 'export const secret = 1;');
    writeFileSync(join(root, 'packages/domain/src/private.ts'), 'export const secret = 1;');
    const filename = join(root, 'packages/ui/src/entry.ts');
    const outside = '../../../apps/web/src/private.ts';
    for (const source of [
      `import { secret } from '${outside}'`,
      `export { secret } from '${outside}'`,
      `const x = import('${outside}')`,
      `const x = require('${outside}')`,
      `type X = import('${outside}').X`,
      `import x = require('${outside}')`,
    ]) {
      const imports = parseImports(filename, source);
      assert.equal(imports.length, 1);
      const to = resolveImport(root, filename, imports[0].specifier);
      assert.equal(to, 'apps/web/src/private.ts');
      assert.throws(
        () => validatePackageEdge('ui', { ...imports[0], to }),
        /another package or app/,
      );
    }
    const escape = parseImports(filename, "const x = import('../../domain/src/private.ts')")[0];
    assert.throws(
      () =>
        validatePackageEdge('ui', {
          ...escape,
          to: resolveImport(root, filename, escape.specifier),
        }),
      /another package or app/,
    );
    assert.throws(() => parseImports(filename, 'import(variable)'), /static module specifier/);
    assert.throws(() => validateImport('domain', '@studio/contracts/src/api'), /deep import/);
    assert.doesNotThrow(() =>
      validatePackageEdge('ui', { specifier: './valid', to: 'packages/ui/src/valid.ts' }),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('frontend layers reject data to router/view and controlled view to data', () => {
  const entries = [
    edge('apps/web/src/data/read.ts', 'apps/web/src/features/tasks/Row.tsx'),
    edge('apps/web/src/data/read.ts', null),
    edge(policy.views[0], 'apps/web/src/data/queries.ts'),
    edge('apps/web/src/features/tasks/Controller.tsx', 'apps/api/src/private.ts'),
  ];
  entries[1].specifier = '@tanstack/react-router';
  assert.deepEqual(
    inspectFrontend(entries, policy).map((row) => row.rule),
    ['data-presentation', 'data-presentation', 'view-data', 'web-server'],
  );
  assert.deepEqual(
    inspectFrontend(
      [edge('apps/web/src/features/tasks/Controller.tsx', 'apps/web/src/data/queries.ts')],
      policy,
    ),
    [],
  );
});

test('cross-feature public symbols are allowed; deep files and extra symbols are rejected', () => {
  const from = 'apps/web/src/features/tasks/Row.tsx';
  const allowed = edge(from, 'apps/web/src/features/people/index.ts', ['MemberIdentity']);
  assert.deepEqual(inspectFrontend([allowed], policy), []);
  assert.equal(
    inspectFrontend([{ ...allowed, symbols: ['MemberIdentity', 'privateHelper'] }], policy)[0].rule,
    'feature-private',
  );
  assert.equal(
    inspectFrontend([edge(from, 'apps/web/src/features/people/private.ts')], policy)[0].rule,
    'feature-private',
  );
});

test('web imports shared packages through declared exports, including dynamic imports', () => {
  const from = 'apps/web/src/features/tasks/Row.tsx';
  assert.equal(
    inspectFrontend([edge(from, 'packages/contracts/src/api.ts')], policy)[0].rule,
    'web-package-private',
  );
  assert.equal(
    inspectFrontend(
      [{ ...edge(from, null), specifier: '@studio/ui/src/controls', kind: 'dynamic' }],
      policy,
    )[0].rule,
    'web-package-private',
  );
  assert.deepEqual(
    inspectFrontend(
      [{ ...edge(from, 'packages/ui/src/index.ts'), specifier: '@studio/ui' }],
      policy,
    ),
    [],
  );
});

test('runtime cycle detection includes dynamic edges and ignores type-only references', () => {
  const a = edge('a', 'b'),
    b = { ...edge('b', 'a'), kind: 'dynamic' };
  assert.equal(cyclicEdges([a, b]).length, 2);
  assert.deepEqual(cyclicEdges([a, { ...b, typeOnly: true }]), []);
  assert.equal(cyclicEdges([edge('a', 'a')]).length, 1);
});

test('legacy budget rejects new edges, symbol changes, broad/stale exemptions and expansion', () => {
  const violation = { rule: 'feature-private', edge: 'a|b|import|Thing' };
  const allowed = {
    ...violation,
    reason: 'Existing dependency, migrate to public owner.',
    removeIn: 'FR-04',
  };
  assert.equal(
    enforceAllowlist([violation], [allowed], ['feature-private:a|b|import|Thing']).status,
    'passed',
  );
  assert.throws(
    () => enforceAllowlist([{ ...violation, edge: 'a|b|import|Thing,Other' }], [allowed]),
    /Stale allowlist/,
  );
  assert.throws(
    () => enforceAllowlist([violation], [{ ...allowed, edge: '*' }]),
    /Stale allowlist/,
  );
  assert.throws(() => enforceAllowlist([violation], [allowed], []), /Allowlist expansion/);
  assert.throws(() => enforceAllowlist([violation], []), /New frontend dependency/);
  assert.throws(() => enforceAllowlist([], [allowed]), /Stale allowlist/);
});

test('every feature JSX file must declare its role and current real graph passes', () => {
  assert.throws(
    () => validateRoles(['NewView.tsx'], { roles: {}, views: [] }),
    /explicit controller\/view/,
  );
  assert.equal(checkFrontend().status, 'passed');
});
