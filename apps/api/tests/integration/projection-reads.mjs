import { localFetch as fetch } from '../support/harness.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHarness } from '../support/harness.mjs';
import { seedRows } from '../../scripts/seed-data.mjs';
import { readFixtureSql } from '../support/read-fixtures.mjs';
import { operations } from '@studio/contracts/api';
const report = { status: 'RUNNING', commands: [], probes: [], matrix: [], metrics: [], plans: [] },
  h = await createHarness('projection-reads', report),
  seed = seedRows(),
  now = Date.now(),
  fixture = readFixtureSql(seed, now);
const entityId = (item) =>
  item.kind === 'tasks'
    ? item.task.id
    : item.kind === 'projects'
      ? item.project.project.id
      : item.kind === 'people'
        ? item.member.id
        : item.kind === 'files'
          ? item.file.id
          : item.comment.id;
async function oracle(scope, kind, query) {
  const response = await fetch(h.baseUrl + '/__reads/oracle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, query, now }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function page(scope, kind, query, explain = false) {
  const path =
      '/api/v1/workspaces/' +
      scope.workspaceId +
      '/' +
      kind +
      '?' +
      new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)])),
    response = await fetch(h.baseUrl + path, {
      headers: explain ? { 'x-read-explain': 'yes' } : {},
    }),
    body = await response.json();
  assert.equal(response.status, 200, path + JSON.stringify(body));
  operations[kind === 'search' ? 'search' : 'listArchive'].response.parse(body);
  report.probes.push({ path, status: response.status });
  if (explain) {
    report.metrics.push({
      kind,
      query,
      observations: JSON.parse(response.headers.get('x-read-observations') ?? '[]'),
    });
    report.plans.push({
      kind,
      query,
      plans: JSON.parse(response.headers.get('x-read-plans') ?? '[]'),
    });
  }
  return body.data;
}
async function traverse(scope, kind, query, explain) {
  const expected = await oracle(scope, kind, query),
    items = [];
  let cursor;
  const ids = new Set();
  do {
    const result = await page(
      scope,
      kind,
      { ...query, limit: 9, ...(cursor ? { cursor } : {}) },
      explain && !cursor,
    );
    assert.equal(result.total, expected.total);
    if (kind === 'search') assert.deepEqual(result.totals, expected.totals);
    for (const item of result.items) {
      assert(!ids.has(item.kind + ':' + entityId(item)));
      ids.add(item.kind + ':' + entityId(item));
    }
    items.push(...result.items);
    cursor = result.nextCursor;
    if (items.length > expected.total) throw new Error('More rows than canonical scope');
  } while (cursor);
  assert.deepEqual(items, expected.items, kind + ' canonical DTO traversal');
  report.matrix.push({ kind, query, workspace: scope.workspaceId, total: expected.total });
}
try {
  h.run('migrate', [
    'pnpm',
    'exec',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--persist-to',
    h.persist,
  ]);
  h.run('seed', ['node', 'scripts/seed-local.mjs', '--persist-to', h.persist]);
  const file = resolve(h.runtime, 'fixture.sql');
  writeFileSync(file, fixture.sql);
  h.run('fixture', [
    'pnpm',
    'exec',
    'wrangler',
    'd1',
    'execute',
    'DB',
    '--local',
    '--persist-to',
    h.persist,
    '--file',
    file,
    '--json',
  ]);
  for (const scope of fixture.scopes) {
    await h.start('scope-' + scope.workspaceId, {
      LOCAL_USER_ID: scope.userId,
      LOCAL_WORKSPACE_ID: scope.workspaceId,
    });
    for (const q of ['ä', '%_', 'k', 'i\u0307', 'a', 'Query', 'comment', ' ', '\\'])
      for (const category of ['all', 'tasks', 'projects', 'people', 'files', 'comments'])
        await traverse(scope, 'search', { q, category }, q === 'ä');
    for (const kind of ['tasks', 'projects'])
      for (const q of ['', 'ä', '%_', 'a', '\\']) await traverse(scope, 'archive', { kind, q }, !q);
  }
  report.status = 'PASS';
  report.acceptance =
    'Native two-workspace full category totals before seek, literal Unicode search, complete DTO traversal, archive ranks/child summary and scoped EXPLAIN';
  h.save('matrix.json', report.matrix);
  h.save('read-metrics.json', report.metrics);
  h.save('query-plans.json', report.plans);
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await h.cleanup();
  console.log(
    JSON.stringify({
      status: report.status,
      matrix: report.matrix.length,
      probes: report.probes.length,
      error: report.error ?? null,
      report: h.out + '/report.json',
    }),
  );
}
