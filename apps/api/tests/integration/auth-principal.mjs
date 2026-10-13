import assert from 'node:assert/strict';
import { createHarness, localFetch } from '../support/harness.mjs';
import { createControlledIdentityProvider } from '../support/identity-provider.mjs';
import { seedRows } from '../../scripts/seed-data.mjs';
import { operations } from '@studio/contracts/api';

const report = { status: 'RUNNING', commands: [], probes: [], budgets: [] };
const h = await createHarness('auth-principal', report);
const provider = await createControlledIdentityProvider();
const { publicKey, secret, providerUrl, accounts, tenant, state } = provider;
state.extraClaims = { roles: ['Owner'], user: JSON.stringify({ role: 'Owner' }) };
let cookie, expected;
async function request(
  name,
  path,
  status = 200,
  { body, method = body ? 'POST' : 'GET', headers = {}, anonymous = false } = {},
) {
  const res = await localFetch(h.baseUrl + path, {
    method,
    headers: {
      origin: h.baseUrl,
      'content-type': 'application/json',
      ...(!anonymous && cookie ? { cookie } : {}),
      ...(!anonymous && expected ? { 'X-Task8-Session-Id': expected } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  report.probes.push({ name, status: res.status });
  const queries = Number(res.headers.get('X-Test-Queries'));
  if (queries) report.budgets.push({ name, queries });
  assert.equal(res.status, status, name + ' ' + JSON.stringify(data.error ?? {}));
  return { data, res };
}
const sql = async (query, parameters = []) =>
  (
    await request('sql-' + report.probes.length, '/__auth/sql', 200, {
      method: 'POST',
      body: { sql: query, parameters },
      anonymous: true,
    })
  ).data.results;
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
  const fixture = seedRows(),
    workspaceId = fixture.primary.workspaceId,
    W = '/api/v1/workspaces/' + workspaceId;
  await h.start(
    'ict24h',
    {
      AUTH_MODE: 'ict24h',
      AUTH_PROVIDER_KEY: 'ict24h-identity',
      AUTH_PROVIDER_BASE_URL: 'https://identity.example.invalid',
      AUTH_TENANT_ID: tenant,
      AUTH_APP_ORIGIN: h.baseUrl,
      AUTH_PUBLIC_KEY: publicKey,
      TEST_PROVIDER_URL: providerUrl,
    },
    false,
    { AUTH_SESSION_ENCRYPTION_KEY: secret },
  );
  const signed = await request('new-principal', '/api/v1/auth/login', 200, {
    body: { email: accounts[0].email, password: 'correct-password', remember: false },
    anonymous: true,
  });
  cookie = signed.res.headers.get('set-cookie').split(';')[0];
  expected = signed.data.data.authSession.id;
  const profile = signed.data.data.user,
    session = await request('waiting-session-200', '/api/v1/session');
  operations.getSession.response.parse(session.data);
  assert.equal(session.data.data.currentWorkspaceId, null);
  assert.equal(session.data.data.capabilities.identityMode, 'ict24h');
  assert.equal(session.data.data.capabilities.features.authentication, 'implemented');
  assert.deepEqual((await request('waiting-workspaces-empty', '/api/v1/workspaces')).data, {
    data: [],
  });
  assert.deepEqual((await request('waiting-profile-readable', '/api/v1/me/profile')).data, {
    data: profile,
  });
  await request('waiting-bootstrap-denied', W + '/bootstrap', 404);
  await request('waiting-profile-write-forbidden', '/api/v1/me/profile', 403, {
    method: 'PATCH',
    body: { name: 'Changed', expectedVersion: profile.version },
  });
  assert.equal(
    (await sql('SELECT version FROM users WHERE id=?', [profile.id]))[0].version,
    profile.version,
  );
  await request('Bearer-not-cookie-actor', '/api/v1/session', 401, {
    anonymous: true,
    headers: { Authorization: 'Bearer ' + provider.issue(accounts[0]).access.token },
  });
  const memberId = '01a11abd-aa80-7000-8000-000000000090';
  await sql(
    `INSERT INTO workspaceMembers(id,workspaceId,userId,role,status,createdAt,updatedAt,version) VALUES(?,?,?,'Member','active',?,?,1)`,
    [memberId, workspaceId, profile.id, Date.now(), Date.now()],
  );
  await sql(
    `INSERT INTO memberPreferences(workspaceId,memberId,preferencesJson,notificationPreferencesJson,updatedAt) SELECT workspaceId,?,preferencesJson,notificationPreferencesJson,? FROM memberPreferences WHERE workspaceId=? AND memberId=?`,
    [memberId, Date.now(), workspaceId, fixture.primary.memberId],
  );
  const ready = await request('controlled-grant-session-ready', '/api/v1/session');
  assert.equal(ready.data.data.user.id, profile.id);
  assert.equal(ready.data.data.currentWorkspaceId, workspaceId);
  const bootstrap = await request('ready-bootstrap', W + '/bootstrap');
  operations.getBootstrap.response.parse(bootstrap.data);
  assert.equal(bootstrap.data.data.currentMember.id, memberId);
  assert.equal(bootstrap.data.data.currentMember.role, 'Member');
  await sql("UPDATE workspaceMembers SET status='invited' WHERE id=?", [memberId]);
  assert.equal(
    (await request('invited-membership-waits', '/api/v1/session')).data.data.currentWorkspaceId,
    null,
  );
  await request('invited-bootstrap-denied', W + '/bootstrap', 404);
  await sql("UPDATE workspaceMembers SET status='active',removedAt=? WHERE id=?", [
    Date.now(),
    memberId,
  ]);
  assert.equal(
    (await request('removed-membership-waits', '/api/v1/session')).data.data.currentWorkspaceId,
    null,
  );
  await request('removed-bootstrap-denied', W + '/bootstrap', 404);
  await sql('UPDATE workspaceMembers SET removedAt=NULL WHERE id=?', [memberId]);
  const workspaces = await sql('SELECT id FROM workspaces ORDER BY id');
  const foreign = workspaces.find((row) => row.id !== workspaceId).id;
  await request(
    'cross-workspace-no-membership',
    '/api/v1/workspaces/' + foreign + '/bootstrap',
    404,
  );
  await sql(
    `INSERT INTO workspaceMembers(id,workspaceId,userId,role,status,createdAt,updatedAt,version) VALUES(?,?,?,'Guest','active',?,?,1)`,
    ['01a11abd-aa80-7000-8000-000000000091', foreign, profile.id, Date.now(), Date.now()],
  );
  assert.equal(
    (await request('deterministic-default', '/api/v1/session')).data.data.currentWorkspaceId,
    [workspaceId, foreign].sort()[0],
  );
  await sql('UPDATE workspaceMembers SET removedAt=? WHERE workspaceId=? AND userId=?', [
    Date.now(),
    [workspaceId, foreign].sort()[0],
    profile.id,
  ]);
  assert.equal(
    (await request('default-fallback', '/api/v1/session')).data.data.currentWorkspaceId,
    [workspaceId, foreign].sort()[1],
  );
  await sql('UPDATE workspaceMembers SET removedAt=NULL WHERE id=?', [memberId]);
  await sql('UPDATE workspaceMembers SET removedAt=? WHERE workspaceId=? AND userId=?', [
    Date.now(),
    foreign,
    profile.id,
  ]);
  const privateProject = fixture.rows.projects.find((row) => row.visibility === 'private');
  const privateTask = fixture.rows.tasks.find(
    (row) => row.projectId === privateProject.id && !row.deletedAt && !row.archivedAt,
  );
  await sql("UPDATE workspaceMembers SET role='Owner' WHERE id=?", [memberId]);
  await request('Owner-no-private-bypass', W + '/tasks/' + privateTask.id, 404);
  await sql(
    'INSERT INTO projectMembers(workspaceId,projectId,memberId,permission) VALUES(?,?,?,?)',
    [workspaceId, privateProject.id, memberId, 'view'],
  );
  const task = await request('private-view-readable', W + '/tasks/' + privateTask.id);
  assert.equal(task.data.data.task.id, privateTask.id);
  const before = (await sql('SELECT * FROM tasks WHERE id=?', [privateTask.id]))[0];
  // Existing task PATCH relation owner classifies a nonwritable project as 400.
  // Keep that contract; this auth unit must not change business error semantics.
  await request('private-view-not-edit', W + '/tasks/' + privateTask.id, 400, {
    method: 'PATCH',
    body: { title: 'Rejected', expectedVersion: before.version },
  });
  assert.deepEqual((await sql('SELECT * FROM tasks WHERE id=?', [privateTask.id]))[0], before);
  await sql(
    "UPDATE projectMembers SET permission='edit' WHERE workspaceId=? AND projectId=? AND memberId=?",
    [workspaceId, privateProject.id, memberId],
  );
  await request('private-edit-allowed', W + '/tasks/' + privateTask.id, 200, {
    method: 'PATCH',
    body: { title: 'Authorized ICT24H edit', expectedVersion: before.version },
  });
  const updated = (await sql('SELECT * FROM tasks WHERE id=?', [privateTask.id]))[0];
  const activityBefore = (await sql('SELECT count(*) count FROM activity'))[0].count;
  const mismatch = await request(
    'expected-session-mismatch-zero-effects',
    W + '/tasks/' + privateTask.id,
    409,
    {
      method: 'PATCH',
      body: { title: 'Wrong browser intent', expectedVersion: updated.version },
      headers: { 'X-Task8-Session-Id': '01a11abd-aa80-7000-8000-000000000001' },
    },
  );
  assert.equal(mismatch.data.error.code, 'SESSION_CHANGED');
  assert.deepEqual((await sql('SELECT * FROM tasks WHERE id=?', [privateTask.id]))[0], updated);
  assert.equal((await sql('SELECT count(*) count FROM activity'))[0].count, activityBefore);
  await request('final-SQL-grant-race', W + '/tasks/' + privateTask.id, 409, {
    method: 'PATCH',
    body: { title: 'Unauthorized race', expectedVersion: updated.version },
    headers: {
      'X-Test-DB-Race': JSON.stringify({
        sql: "UPDATE projectMembers SET permission='view' WHERE workspaceId=? AND projectId=? AND memberId=?",
        parameters: [workspaceId, privateProject.id, memberId],
      }),
    },
  });
  assert.deepEqual((await sql('SELECT * FROM tasks WHERE id=?', [privateTask.id]))[0], updated);
  assert.equal((await sql('SELECT count(*) count FROM activity'))[0].count, activityBefore);
  const bulk = await sql(
    `SELECT t.id,t.version FROM tasks t JOIN projects p ON p.id=t.projectId AND p.workspaceId=t.workspaceId
    WHERE t.workspaceId=? AND p.visibility='workspace' AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND t.deletedAt IS NULL AND t.archivedAt IS NULL ORDER BY t.id LIMIT 20`,
    [workspaceId],
  );
  assert.equal(bulk.length, 20, 'maximum bulk gate uses exactly20 actual active public tasks');
  const maxBulk = await request('maximum20-bulk-includes-auth-budget', W + '/tasks/bulk', 200, {
    method: 'POST',
    body: {
      operation: 'patch',
      items: bulk.map((row) => ({ id: row.id, expectedVersion: row.version })),
      patch: { dueDate: '2030-01-01' },
    },
  });
  operations.bulkMutateTasks.response.parse(maxBulk.data);
  assert(report.budgets.every((row) => row.queries <= 50));
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await h.cleanup();
  await provider.close();
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.length,
      error: report.error ?? null,
      report: h.out + '/report.json',
    }),
  );
}
