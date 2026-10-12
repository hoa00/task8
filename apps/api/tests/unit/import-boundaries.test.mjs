import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBoundaries, inspectBoundaries, importsOf } from '../../tooling/import-boundaries.mjs';
const empty = { imports: [], cycles: [] };
const files = (entries) => new Map(Object.entries(entries));
test('current API has only exact documented legacy debt', () =>
  assert.equal(checkBoundaries().status, 'PASS'));
const invalid = [
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
  assert.equal(checkBoundaries(entries, legacy).status, 'PASS');
  entries.set('src/shared/a.ts', "import './b.ts'; import './c.ts';");
  assert.throws(() => checkBoundaries(entries, legacy), /unexpectedCycles/);
});
test('reject stale and wildcard legacy exemptions', () => {
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
});
