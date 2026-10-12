import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBoundaries, inspectBoundaries, importsOf } from '../../tooling/import-boundaries.mjs';
const empty = { imports: [], cycles: [] };
const files = (entries) => new Map(Object.entries(entries));
test('current API has zero legacy exemptions', () =>
  assert.deepEqual(
    [checkBoundaries().status, checkBoundaries().legacyImports, checkBoundaries().legacyCycles],
    ['PASS', 0, 0],
  ));
const invalid = [
  [
    'flat compatibility feature owner',
    {
      'src/modules/tasks.ts': "export {createTask} from './tasks/index.ts';",
      'src/modules/tasks/index.ts': '',
    },
  ],
  [
    'domain importing request context',
    {
      'src/modules/tasks/domain/model.ts':
        "import type { ApiEnvironment } from '../../../runtime.ts';",
      'src/runtime.ts': '',
    },
  ],
  [
    'domain importing Hono',
    { 'src/modules/tasks/domain/model.ts': "import type { Context } from 'hono';" },
  ],
  [
    'domain importing D1 rows',
    {
      'src/modules/tasks/domain/model.ts': "import type { Row } from '../../../db/schema.ts';",
      'src/db/schema.ts': '',
    },
  ],
  [
    'mapper importing persistence',
    {
      'src/modules/tasks/mapper.ts': "import { read } from './persistence/reads.ts';",
      'src/modules/tasks/persistence/reads.ts': '',
    },
  ],
  [
    'route importing DB',
    {
      'src/modules/tasks/routes.ts': "import { db } from '../../db/client.ts';",
      'src/db/client.ts': '',
    },
  ],
  [
    'application importing Hono',
    { 'src/modules/tasks/application/create.ts': "import { Hono } from 'hono';" },
  ],
  [
    'shared importing business public API',
    {
      'src/shared/ids.ts': "import { task } from '../modules/tasks/index.ts';",
      'src/modules/tasks/index.ts': '',
    },
  ],
  [
    'cross-feature deep import',
    {
      'src/modules/projects/application/read.ts':
        "import { read } from '../../tasks/persistence/reads.ts';",
      'src/modules/tasks/persistence/reads.ts': '',
    },
  ],
  [
    'frontend relative import',
    { 'src/modules/tasks/index.ts': "import { adapter } from '../../../../web/src/data.ts';" },
  ],
  [
    'frontend package alias',
    { 'src/modules/tasks/index.ts': "import { adapter } from '@studio/web';" },
  ],
  ['computed dynamic import', { 'src/shared/ids.ts': 'import(variable);' }],
  [
    'reexport internal business API',
    {
      'src/shared/index.ts': "export * from '../modules/tasks/index.ts';",
      'src/modules/tasks/index.ts': '',
    },
  ],
];
for (const [name, entries] of invalid)
  test('reject ' + name, () => assert.throws(() => checkBoundaries(files(entries), empty)));
test('allow cross-feature public API and pure domain imports', () =>
  assert.equal(
    checkBoundaries(
      files({
        'src/modules/projects/application/read.ts': "import { read } from '../../tasks/index.ts';",
        'src/modules/tasks/index.ts': "export { read } from './application/read.ts';",
        'src/modules/tasks/application/read.ts':
          "import type { EntityId } from '@studio/contracts/api';",
      }),
      empty,
    ).status,
    'PASS',
  ));
test('AST ignores comments and strings, detects static dynamic imports', () =>
  assert.deepEqual(
    importsOf(
      'src/shared/a.ts',
      "// import 'hono'\nconst text = \"import('hono')\"; import('./b.ts');",
    ),
    ['./b.ts'],
  ));
test('reject new cycle and reject new edge inside a legacy cycle', () => {
  const entries = files({
    'src/shared/a.ts': "import './b.ts';",
    'src/shared/b.ts': "import './c.ts';",
    'src/shared/c.ts': "import './a.ts';",
  });
  assert.throws(() => checkBoundaries(entries, empty), /unexpectedCycles/);
  const legacy = {
    imports: [],
    cycles: inspectBoundaries(entries).cycles.map((cycle) => ({ ...cycle, removeIn: 'BR-03' })),
  };
  assert.throws(() => checkBoundaries(entries, legacy), /closed/);
  entries.set('src/shared/a.ts', "import './b.ts'; import './c.ts';");
  assert.throws(() => checkBoundaries(entries, legacy), /unexpectedCycles/);
});
test('reject stale, wildcard and reopening exact legacy exemptions', () => {
  assert.throws(
    () =>
      checkBoundaries(files({ 'src/shared/a.ts': '' }), {
        imports: [{ from: 'src/shared/a.ts', to: 'hono', rule: 'layer', removeIn: 'BR-03' }],
        cycles: [],
      }),
    /stale/,
  );
  assert.throws(
    () =>
      checkBoundaries(new Map(), {
        imports: [{ from: 'src/modules/*', to: 'hono', rule: 'layer', removeIn: 'BR-03' }],
        cycles: [],
      }),
    /finite/,
  );
  assert.throws(
    () =>
      checkBoundaries(files({ 'src/shared/a.ts': "import 'hono';" }), {
        imports: [{ from: 'src/shared/a.ts', to: 'hono', rule: 'layer', removeIn: 'BR-03' }],
        cycles: [],
      }),
    /closed/,
  );
});

test('named public persistence predicate preserves its leaf layer', () => {
  assert.equal(
    checkBoundaries(
      files({
        'src/modules/tasks/persistence/read.ts':
          "import {readAccessSql} from '../../projects/index.ts';",
        'src/modules/projects/index.ts':
          "export {readAccessSql} from './persistence/policy.ts'; export {createProject} from './application/create.ts';",
        'src/modules/projects/persistence/policy.ts': '',
        'src/modules/projects/application/create.ts': '',
      }),
      empty,
    ).status,
    'PASS',
  );
});
test('public facade cannot hide application dependency from persistence', () => {
  assert.throws(() =>
    checkBoundaries(
      files({
        'src/modules/tasks/persistence/read.ts':
          "import {createProject} from '../../projects/index.ts';",
        'src/modules/projects/index.ts': "export {createProject} from './application/create.ts';",
        'src/modules/projects/application/create.ts': '',
      }),
      empty,
    ),
  );
});

test('only listed cross-aggregate fragment facade is public', () => {
  const valid = files({
    'src/modules/tasks/persistence/commands.ts':
      "import {moveTaskFiles} from '../../files/plans.ts';",
    'src/modules/files/plans.ts': "export {moveTaskFiles} from './persistence/associations.ts';",
    'src/modules/files/persistence/associations.ts': '',
  });
  assert.equal(checkBoundaries(valid, empty).status, 'PASS');
  valid.set(
    'src/modules/tasks/persistence/commands.ts',
    "import {moveTaskFiles} from '../../files/persistence/associations.ts';",
  );
  assert.throws(() => checkBoundaries(valid, empty));
});

test('immutable local Wasm resources resolve through the same owner boundary', () => {
  assert.equal(
    checkBoundaries(
      files({
        'src/shared/collation/encoder.ts': "import module from './icu78-en-US.wasm';",
        'src/shared/collation/icu78-en-US.wasm': '',
      }),
      empty,
    ).status,
    'PASS',
  );
  assert.throws(() =>
    checkBoundaries(
      files({
        'src/shared/collation/encoder.ts': "import module from './missing.wasm';",
      }),
      empty,
    ),
  );
  assert.throws(() =>
    checkBoundaries(
      files({
        'src/modules/tasks/domain/model.ts':
          "import module from '../../files/persistence/internal.wasm';",
        'src/modules/files/persistence/internal.wasm': '',
      }),
      empty,
    ),
  );
});
