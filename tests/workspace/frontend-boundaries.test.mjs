import { fieldBindingViolations } from './frontend-fields.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseImports, resolveImport, cyclicEdges } from './import-graph.mjs';
import { validatePackageEdge, validateImport } from './boundaries.mjs';
import {
  inspectFrontend,
  enforceFrontend,
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
  roles: { 'apps/web/src/features/tasks/Row.tsx': 'view' },
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

test('completed migrations reject every dependency violation without legacy exemptions', () => {
  assert.equal(enforceFrontend([]).status, 'passed');
  for (const violation of [
    { rule: 'feature-private', edge: 'a|b|import|Thing' },
    { rule: 'feature-private', edge: 'a|b|import|Thing,Other' },
    {
      rule: 'data-presentation',
      edge: 'apps/web/src/data/adapters/http-entry.ts|apps/web/src/app/env.ts|import|PublicEnv',
    },
    { rule: 'view-data', edge: '*' },
  ])
    assert.throws(() => enforceFrontend([violation]), /Frontend dependency violation/);
});

test('every feature JSX file must declare its role and current real graph passes', () => {
  assert.throws(
    () => validateRoles(['NewView.tsx'], { roles: {}, views: [] }),
    /explicit controller\/view/,
  );
  assert.equal(checkFrontend().status, 'passed');
});

test('mock owners cannot reopen compatibility imports or make primitives depend on business handlers', () => {
  assert.equal(
    inspectFrontend(
      [edge('apps/web/src/data/mock/projects.ts', 'apps/web/src/data/mock/task-fields.ts')],
      policy,
    )[0].rule,
    'mock-compat-import',
  );
  assert.equal(
    inspectFrontend(
      [edge('apps/web/src/data/mock/primitives.ts', 'apps/web/src/data/mock/task-commands.ts')],
      policy,
    )[0].rule,
    'mock-primitive-direction',
  );
});

test('controlled views cannot import a component controller as an indirect data shortcut', () => {
  const p = {
    ...policy,
    roles: { ...policy.roles, 'apps/web/src/features/tasks/Rows.tsx': 'controller' },
  };
  const link = edge('apps/web/src/features/tasks/Row.tsx', 'apps/web/src/features/tasks/Rows.tsx');
  assert.equal(inspectFrontend([link], p)[0].rule, 'view-controller');
  assert.deepEqual(inspectFrontend([{ ...link, typeOnly: true }], p), []);
});

test('Field requires a render callback that forwards label and error bindings', () => {
  assert.equal(
    fieldBindingViolations(
      'Form.tsx',
      'const form = <Field label="Name"><Input value=""/></Field>;',
    )[0].rule,
    'field-control-binding',
  );
  assert.equal(
    fieldBindingViolations(
      'Form.tsx',
      'const form = <Field label="Name">{() => <Input value=""/>}</Field>;',
    )[0].rule,
    'field-control-binding',
  );
  assert.deepEqual(
    fieldBindingViolations(
      'Form.tsx',
      'const form = <Field label="Name">{control => <Input {...control} value=""/>}</Field>;',
    ),
    [],
  );
});
