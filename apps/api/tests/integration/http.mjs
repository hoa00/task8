import assert from 'node:assert/strict';
import { createHarness } from '../support/harness.mjs';
import { seedRows } from '../../scripts/seed-data.mjs';
import { operations, ApiErrorSchema } from '@studio/contracts/api';
const report = { status: 'RUNNING', commands: [], probes: [] };
const harness = await createHarness('http', report),
  { out, save, run, persist, start, baseUrl } = harness;
const seed = seedRows(),
  W = '/api/v1/workspaces/' + seed.primary.workspaceId;
let serial = 0;
async function request(name, path, status = 200, options = {}) {
  const response = await fetch(baseUrl + path, { ...options, signal: AbortSignal.timeout(30000) }),
    data = await response.json();
  report.probes.push({ name, path, status: response.status });
  assert.equal(response.status, status, name);
  if (status >= 400) ApiErrorSchema.parse(data);
  assert.match(response.headers.get('x-request-id') ?? '', /^[a-f0-9-]{36}$/);
  save(name + '.json', data);
  return data.data ?? data;
}
async function sql(query, parameters = []) {
  const response = await fetch(baseUrl + '/__wu31/sql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sql: query, parameters }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).results;
}
try {
  run('migrate', [
    'pnpm',
    'exec',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--persist-to',
    persist,
  ]);
  run('seed', ['node', 'scripts/seed-local.mjs', '--persist-to', persist]);
  await start('owner', {
    LOCAL_USER_ID: seed.primary.userId,
    LOCAL_WORKSPACE_ID: seed.primary.workspaceId,
  });
  await request('invalid-internal-response', '/__http/invalid-response', 500);
  for (const [path, status] of [
    [W + '/tasks?limit=1e2', 400],
    [W + '/tasks?limit=1&limit=2', 400],
    [W + '/tasks?filters=bad', 400],
    [W + '/tasks?favoriteOnly=1', 400],
    [W + '/tasks/not-an-id', 400],
    [W + '/projects/' + seed.rows.projects[0].id + '/files?limit=1e1', 400],
  ])
    await request('invalid-' + ++serial, path, status);
  await request('malformed-json', W + '/tasks', 400, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  const members = await request('members-first', W + '/members?limit=2');
  operations.listMembers.response.parse({ data: members });
  const memberAnchor = members.items.at(-1);
  assert.notEqual(memberAnchor.id, seed.primary.memberId);
  assert(members.nextCursor);
  await sql('UPDATE users SET name=? WHERE id=?', ['ZZZ renamed anchor', memberAnchor.userId]);
  const renamed = await request(
    'members-renamed-anchor',
    W + '/members?limit=2&cursor=' + members.nextCursor,
  );
  assert(
    renamed.items.every(
      (row) =>
        (row.name.localeCompare(memberAnchor.name) || row.id.localeCompare(memberAnchor.id)) > 0,
    ),
  );
  await sql('UPDATE workspaceMembers SET removedAt=? WHERE id=?', [Date.now(), memberAnchor.id]);
  const removed = await request(
    'members-removed-anchor',
    W + '/members?limit=2&cursor=' + members.nextCursor,
  );
  assert(!removed.items.some((row) => row.id === memberAnchor.id));
  await request(
    'members-query-mismatch',
    W + '/members?status=active&limit=2&cursor=' + members.nextCursor,
    400,
  );
  await sql('UPDATE workspaceMembers SET removedAt=NULL WHERE id=?', [memberAnchor.id]);
  await sql('UPDATE users SET name=? WHERE id=?', [memberAnchor.name, memberAnchor.userId]);
  for (const sort of ['name', 'recent', 'due', 'progress']) {
    const projects = await request(
      'projects-' + sort + '-first',
      W + '/projects?sort=' + sort + '&limit=1',
    );
    assert(projects.nextCursor);
    const anchor = projects.items[0].project;
    await sql('UPDATE projects SET archivedAt=? WHERE id=?', [Date.now(), anchor.id]);
    const next = await request(
      'projects-' + sort + '-anchor-gone',
      W + '/projects?sort=' + sort + '&limit=1&cursor=' + projects.nextCursor,
    );
    assert(!next.items.some((row) => row.project.id === anchor.id));
    await request(
      'projects-' + sort + '-different-sort',
      W +
        '/projects?sort=' +
        (sort === 'name' ? 'recent' : 'name') +
        '&limit=1&cursor=' +
        projects.nextCursor,
      400,
    );
    await sql('UPDATE projects SET archivedAt=NULL WHERE id=?', [anchor.id]);
  }
  await harness.stopWorker();
  await start(
    'production',
    { LOCAL_USER_ID: seed.primary.userId, LOCAL_WORKSPACE_ID: seed.primary.workspaceId },
    true,
  );
  await request('no-production-corruption-hook', '/__http/invalid-response', 404);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await harness.cleanup();
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.length,
      error: report.error ?? null,
      report: out + '/report.json',
    }),
  );
}
