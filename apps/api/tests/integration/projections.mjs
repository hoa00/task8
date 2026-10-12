import { withReadKeys } from '../../scripts/read-keys.mjs';
// Active feature scenarios adapted from WU-36; production code is imported by the Worker.
import { createHarness } from '../support/harness.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedRows } from '../../scripts/seed-data.mjs';
import { operations, ApiErrorSchema, TaskQuerySchema } from '@studio/contracts/api';
import { sourceId } from '@studio/contracts/source-identities';
import { completedInRollingWeek, summarizeTasks } from '@studio/domain';
import { createHttpClient } from '../../../web/src/data/adapters/http.ts';
import { loadTaskViewDataset } from '../../../web/src/features/tasks/loadTaskViewDataset.ts';
const report = {
  status: 'RUNNING',
  runtime: 'actual Wrangler local Worker/D1',
  commands: [],
  probes: [],
  snapshotPairs: [],
  acceptance: [],
};
const harness = await createHarness('projections', report);
const { out, persist, baseUrl, save, run, start, stopWorker: stop } = harness;
let sequence = 0;
async function request(name, path, { method = 'GET', payload, status = 200, injection } = {}) {
  const headers = {
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(injection
        ? { 'x-wu34-test': typeof injection === 'string' ? injection : JSON.stringify(injection) }
        : {}),
    },
    body = payload === undefined ? undefined : JSON.stringify(payload),
    response = await fetch(baseUrl + path, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(15000),
    }),
    bytes = await response.text();
  writeFileSync(resolve(out, name + '.response.json'), bytes);
  if (body !== undefined) writeFileSync(resolve(out, name + '.request.json'), body);
  const data = JSON.parse(bytes),
    budget = response.headers.has('x-wu34-queries')
      ? {
          queries: Number(response.headers.get('x-wu34-queries')),
          parameters: Number(response.headers.get('x-wu34-parameters')),
        }
      : null;
  const row = {
    name,
    method,
    path,
    headers,
    ...(body !== undefined ? { body } : {}),
    status: response.status,
    response: data,
    budget,
  };
  save(name + '.json', row);
  report.probes.push({ name, path, status: response.status, budget, evidence: name + '.json' });
  assert.equal(response.status, status, name + ':' + bytes);
  if (budget) assert(budget.queries <= 50 && budget.parameters <= 100);
  if (status >= 400) ApiErrorSchema.parse(data);
  return data;
}
const seed = seedRows(),
  W = '/api/v1/workspaces/' + seed.primary.workspaceId,
  m1 = seed.primary.memberId,
  m2 = sourceId('members', 'm2'),
  privateId = sourceId('projects', 'p6'),
  vars = (primary) => ({ LOCAL_USER_ID: primary.userId, LOCAL_WORKSPACE_ID: primary.workspaceId });
async function op(
  name,
  key,
  { query, body, workspaceId = seed.primary.workspaceId, ...ids } = {},
  status = 200,
  injection,
) {
  let path = operations[key].path.replace('{workspaceId}', workspaceId);
  for (const [field, value] of Object.entries(ids))
    path = path.replace('{' + field + '}', encodeURIComponent(value));
  if (query) {
    const qs = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [
        k,
        typeof v === 'object' ? JSON.stringify(v) : String(v),
      ]),
    );
    path += '?' + qs;
  }
  const result = await request(name, path, {
    method: operations[key].method,
    ...(body !== undefined ? { payload: body } : {}),
    status,
    injection,
  });
  if (status < 400) operations[key].response.parse(result);
  return result.data;
}
const sql = (query, parameters = []) =>
  request('sql-' + ++sequence, '/__wu34/sql', {
    method: 'POST',
    payload: { sql: query, parameters },
  }).then((r) => r.results);
const snap = (name) => request(name, '/__wu34/snapshot').then((r) => r.rows);
async function zero(name, action) {
  const before = await snap(name + '-before');
  await action();
  const after = await snap(name + '-after');
  assert.deepEqual(after, before);
  report.snapshotPairs.push([name + '-before', name + '-after']);
}
const client = createHttpClient({
  fetch: async (path, options) => {
    const name = 'adapter-' + ++sequence,
      response = await fetch(baseUrl + path, options),
      raw = await response.clone().text();
    writeFileSync(resolve(out, name + '.response.json'), raw);
    const data = JSON.parse(raw),
      budget = response.headers.has('x-wu34-queries')
        ? {
            queries: Number(response.headers.get('x-wu34-queries')),
            parameters: Number(response.headers.get('x-wu34-parameters')),
          }
        : null;
    save(name + '.json', {
      name,
      method: options.method,
      path,
      status: response.status,
      response: data,
      budget,
    });
    report.probes.push({ name, path, status: response.status, budget, evidence: name + '.json' });
    return response;
  },
});
const uid = (i) => `01d00000-0000-7000-8000-${i.toString(16).padStart(12, '0')}`;
async function extend(primary, rows, offset, word) {
  const ps = rows.projects.filter((p) => p.visibility === 'workspace' && !p.archivedAt).slice(0, 2),
    base = rows.tasks.find((t) => t.projectId === ps[0].id && !t.archivedAt),
    now = Date.now();
  const tasks = Array.from({ length: 235 }, (_, i) => ({
    ...base,
    id: uid(offset + i),
    projectId: ps[i % 2].id,
    number: 10001 + i,
    title: word + ' ' + String(i).padStart(3, '0'),
    descriptionHtml: '<p>WU34 descriptionOnly %_ literal</p>',
    descriptionText: 'WU34 descriptionOnly %_ literal',
    status: ['backlog', 'todo', 'progress', 'review', 'done'][i % 5],
    priority: ['urgent', 'high', 'medium', 'low', 'none'][i % 5],
    assigneeId: i % 3 === 0 ? null : rows.workspaceMembers[i % 2].id,
    startDate: i === 234 ? '2028-01-01' : '2028-01-25',
    dueDate: i === 234 ? null : '2028-02-01',
    completedAt: i % 5 === 4 ? now - (i === 4 ? 7 * 86400000 : 86400000) : null,
    archivedAt: null,
    position: 20000 + i * 100,
    createdAt: now,
    updatedAt: now,
    createdBy: primary.memberId,
    version: 1,
  }));
  const normalizedTasks = tasks.map((task) => withReadKeys('tasks', task));
  const cols = Object.keys(normalizedTasks[0]);
  await sql(
    `INSERT INTO tasks(${cols.join(',')}) SELECT ${cols.map((k) => `json_extract(value,'$.${k}')`).join(',')} FROM json_each(?)`,
    [JSON.stringify(normalizedTasks)],
  );
  await sql(
    'UPDATE projects SET taskSequence=11000 WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?))',
    [primary.workspaceId, JSON.stringify(ps.map((p) => p.id))],
  );
  return { tasks, ps };
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
  await start('owner', vars(seed.primary));
  const session = await op('session', 'getSession');
  assert.equal(session.capabilities.features.projects, 'implemented');
  assert.equal(session.capabilities.features.notificationState, 'implemented');
  assert.equal(session.capabilities.features.fileMetadata, 'implemented');
  const baseline = await op('baseline-bootstrap', 'getBootstrap'),
    baseHome = await op('baseline-home', 'getHome'),
    baseOverview = await op('baseline-overview', 'getOverview'),
    baseAll = await loadTaskViewDataset(
      client,
      seed.primary.workspaceId,
      TaskQuerySchema.parse({}),
    );
  assert.equal(baseHome.counters.totalTasks, baseAll.items.length);
  assert.deepEqual(baseOverview.taskSummary, baseAll.summary);
  assert.deepEqual(
    baseHome.myTasks.items.map((t) => t.id).sort(),
    baseAll.items
      .filter((t) => t.assigneeId === m1)
      .map((t) => t.id)
      .sort(),
  );
  const baseNotif = await op('baseline-notifications', 'listNotifications');
  assert.equal(baseNotif.unreadCount, baseline.unreadCount);
  assert.equal(
    baseNotif.items.filter((n) => !n.readAt && n.type !== 'update').length,
    baseline.navigationCounts.inbox,
  );
  const events = await op('baseline-events', 'listCalendarEvents', {
      query: { from: '2000-01-01', to: '2099-12-31' },
    }),
    milestones = await op('baseline-milestones', 'listMilestones');
  assert.deepEqual(
    events.map((e) => e.id).sort(),
    seed.rows.calendarEvents
      .filter(
        (e) =>
          e.projectId !== privateId &&
          seed.rows.projects.some((p) => p.id === e.projectId && !p.archivedAt),
      )
      .map((e) => e.id)
      .sort(),
  );
  assert(events.every((e) => e.localTime && e.timezone));
  assert(milestones.every((m) => m.projectId !== privateId));
  const primary = await extend(seed.primary, seed.rows, 1000, "WU34 needle %_ quote'"),
    secondary = await extend(seed.isolation, seed.secondary, 2000, 'WU34 secondary secret');
  const full = await loadTaskViewDataset(
    client,
    seed.primary.workspaceId,
    TaskQuerySchema.parse({}),
  );
  assert.equal(full.coverage, 'complete');
  assert.equal(full.matchedCount, baseAll.matchedCount + 235);
  assert.equal(full.items.length, full.summary.total);
  assert.equal(new Set(full.items.map((t) => t.id)).size, full.items.length);
  const board = full,
    cal = await loadTaskViewDataset(
      client,
      seed.primary.workspaceId,
      TaskQuerySchema.parse({ rangeFrom: '2028-02-01', rangeTo: '2028-02-01' }),
    ),
    timeline = await loadTaskViewDataset(
      client,
      seed.primary.workspaceId,
      TaskQuerySchema.parse({
        rangeFrom: '2028-02-01',
        rangeTo: '2028-02-01',
        rangeBasis: 'overlap',
      }),
    );
  assert.equal(cal.matchedCount, 234);
  assert.equal(timeline.matchedCount, 234);
  assert(board.matchedCount > 200);
  assert(cal.items.every((t) => t.dueDate === '2028-02-01'));
  const home = await op('multi-home', 'getHome'),
    overview = await op('multi-overview', 'getOverview');
  assert.equal(home.counters.totalTasks, full.matchedCount);
  assert.deepEqual(overview.taskSummary, full.summary);
  assert.equal(home.myTasks.total, full.items.filter((t) => t.assigneeId === m1).length);
  assert.equal(
    home.counters.completedThisWeek,
    completedInRollingWeek(full.items, new Date().toISOString()),
  );
  for (const p of primary.ps) {
    const summary = await op('project-summary-' + p.id, 'getProjectSummary', { projectId: p.id }),
      group = full.items.filter((t) => t.projectId === p.id),
      date = new Intl.DateTimeFormat('en-CA', {
        timeZone: baseline.workspace.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    assert.deepEqual(summary.taskSummary, summarizeTasks(group, date));
  }
  const member = await op('member-summary', 'getMemberSummary', { memberId: m1 });
  assert.equal(
    member.open,
    full.items.filter((t) => t.assigneeId === m1 && t.status !== 'done').length,
  );
  const teamId = baseline.currentMember.teamId;
  if (teamId) {
    const team = await op('team-summary', 'getTeamSummary', { teamId });
    assert.equal(
      team.open,
      team.workload.reduce((n, r) => n + r.open, 0),
    );
  }
  const searchQuery = { q: "needle %_ quote'", limit: 50 },
    search1 = await op('search-page1', 'search', { query: searchQuery });
  assert.equal(search1.total, 235);
  assert.equal(search1.totals.tasks, 235);
  let results = [...search1.items],
    cursor = search1.nextCursor;
  while (cursor) {
    const page = await op('search-page-' + ++sequence, 'search', {
      query: { ...searchQuery, cursor },
    });
    assert.equal(page.total, 235);
    results.push(...page.items);
    cursor = page.nextCursor;
  }
  assert.equal(results.length, 235);
  assert.equal(new Set(results.map((r) => r.task.id)).size, 235);
  const category = await op('search-category', 'search', {
    query: { ...searchQuery, category: 'comments' },
  });
  assert.equal(category.total, 0);
  assert.equal(category.totals.tasks, 235);
  assert.equal(
    (await op('search-description', 'search', { query: { q: 'descriptionOnly %_' } })).total,
    235,
  );
  assert.equal(
    (await op('search-injection-literal', 'search', { query: { q: "' OR 1=1 --" } })).total,
    0,
  );
  assert.equal(
    (await op('search-secondary-hidden', 'search', { query: { q: 'secondary secret' } })).total,
    0,
  );
  const allComments = await op('search-comments', 'search', {
    query: { q: seed.rows.comments[0].bodyText.slice(0, 15), category: 'comments' },
  });
  if (allComments.items.length) {
    const c = allComments.items[0].comment,
      commentList = await op('comment-canonical', 'listComments', { taskId: c.taskId });
    assert.deepEqual(
      c,
      commentList.items.find((row) => row.id === c.id),
    );
  }
  const fileSearch = await op('search-files', 'search', {
    query: { q: seed.rows.files[0].name.slice(0, 4), category: 'files' },
  });
  assert(fileSearch.items.every((r) => r.file.projectId !== privateId));
  // Full dataset mismatch, cursor loops and HTTP rejection remain explicit errors.
  await assert.rejects(
    () =>
      loadTaskViewDataset(
        {
          ...client,
          execute: async (id, input, options) => {
            const value = await client.execute(id, input, options);
            return id === 'getTaskSummary'
              ? { data: { ...value.data, total: value.data.total + 1 } }
              : value;
          },
        },
        seed.primary.workspaceId,
        TaskQuerySchema.parse({}),
      ),
    /scope changed/,
  );
  const loopPage = await client.execute('listTasks', {
    workspaceId: seed.primary.workspaceId,
    query: { limit: 200 },
  });
  await assert.rejects(
    () =>
      loadTaskViewDataset(
        {
          ...client,
          execute: async (id, input, options) =>
            id === 'listTasks'
              ? { data: { ...loopPage.data, nextCursor: 'same' } }
              : client.execute(id, input, options),
        },
        seed.primary.workspaceId,
        TaskQuerySchema.parse({}),
      ),
    /cursor did not advance/,
  );
  await assert.rejects(
    () =>
      client.execute('listProjectFiles', {
        workspaceId: seed.primary.workspaceId,
        projectId: privateId,
        query: {},
      }),
    (error) => error.detail.code === 'NOT_FOUND',
  );
  const abort = new AbortController();
  abort.abort(new Error('WU34 canceled'));
  await assert.rejects(
    () =>
      loadTaskViewDataset(
        client,
        seed.primary.workspaceId,
        TaskQuerySchema.parse({}),
        abort.signal,
      ),
    /WU34 canceled/,
  );
  // Read state uses one recipient scope; seed > page and hidden/private children.
  const notifRows = Array.from({ length: 65 }, (_, i) => ({
    id: uid(3000 + i),
    workspaceId: seed.primary.workspaceId,
    recipientId: m1,
    actorId: m2,
    projectId: primary.ps[0].id,
    taskId: primary.tasks[0].id,
    type: i % 2 ? 'mention' : 'update',
    text: 'WU34 notification ' + i,
    snippet: 'same canonical task',
    createdAt: Date.now() + i,
    readAt: null,
  }));
  const nc = Object.keys(notifRows[0]);
  await sql(
    `INSERT INTO notifications(${nc.join(',')}) SELECT ${nc.map((k) => `json_extract(value,'$.${k}')`).join(',')} FROM json_each(?)`,
    [JSON.stringify(notifRows)],
  );
  const privateTask = seed.rows.tasks.find((t) => t.projectId === privateId);
  await sql(
    'INSERT INTO notifications(id,workspaceId,recipientId,projectId,taskId,type,text,snippet,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    [
      uid(3090),
      seed.primary.workspaceId,
      m1,
      privateId,
      privateTask.id,
      'mention',
      'private hidden',
      'secret',
      Date.now(),
    ],
  );
  const unread = await op('notification-page1', 'listNotifications', {
      query: { unreadOnly: true, limit: 1 },
    }),
    afterBadge = await op('notification-bootstrap', 'getBootstrap');
  assert.equal(unread.unreadCount, afterBadge.unreadCount);
  assert(unread.unreadCount >= 65);
  assert.equal(
    afterBadge.navigationCounts.inbox,
    (
      await op('notification-full-cohort', 'listNotifications', { query: { limit: 200 } })
    ).items.filter((n) => !n.readAt && n.type !== 'update').length,
  );
  await op('read-anchor', 'updateNotification', {
    notificationId: unread.items[0].id,
    body: { read: true },
  });
  const continuation = await op('notification-after-anchor-read', 'listNotifications', {
    query: { unreadOnly: true, limit: 1, cursor: unread.nextCursor },
  });
  assert.notEqual(continuation.items[0].id, unread.items[0].id);
  const readState = await op('read-one', 'updateNotification', {
    notificationId: unread.items[0].id,
    body: { read: true },
  });
  await zero('read-idempotent', () =>
    op('read-one-again', 'updateNotification', {
      notificationId: readState.id,
      body: { read: true },
    }),
  );
  const markUnread = await op('mark-unread', 'updateNotification', {
    notificationId: readState.id,
    body: { read: false },
  });
  assert.equal(markUnread.readAt, null);
  const beforeMark = await op('before-mark-all', 'listNotifications'),
    marked = await op('mark-all', 'readAllNotifications');
  assert.equal(marked.changedCount, beforeMark.unreadCount);
  assert.equal(marked.unreadCount, 0);
  assert.equal((await op('markall-bootstrap', 'getBootstrap')).unreadCount, 0);
  await zero('markall-idempotent', () => op('mark-all-again', 'readAllNotifications'));
  assert.equal(
    (await sql('SELECT readAt FROM notifications WHERE id=?', [uid(3090)]))[0].readAt,
    null,
  );
  const actorInjection = {
    sql: `UPDATE workspaceMembers SET status='invited' WHERE workspaceId=? AND id=?`,
    parameters: [seed.primary.workspaceId, m1],
    snapshot: true,
    restore: {
      sql: `UPDATE workspaceMembers SET status='active' WHERE workspaceId=? AND id=?`,
      parameters: [seed.primary.workspaceId, m1],
    },
  };
  await zero('markall-lost-actor', async () => {
    await op('markall-noop-lost-actor', 'readAllNotifications', {}, 409, actorInjection);
    const inner = await request('markall-lost-actor-observation', '/__wu34/injection');
    assert.deepEqual(inner.before, inner.after);
  });
  await op('notification-unread-restore', 'updateNotification', {
    notificationId: readState.id,
    body: { read: false },
  });
  const prefs = await op('preferences-before', 'getPreferences'),
    np = await op('notification-preferences-before', 'getNotificationPreferences');
  await Promise.all([
    op('prefs-concurrent-theme', 'updatePreferences', { body: { theme: 'dark' } }),
    op('prefs-concurrent-density', 'updatePreferences', { body: { density: 'compact' } }),
  ]);
  const merged = await op('preferences-merged', 'getPreferences');
  assert.deepEqual(merged, { ...prefs, theme: 'dark', density: 'compact' });
  await Promise.all([
    op('np-concurrent-email', 'updateNotificationPreferences', {
      body: { emailDigest: false, mentionTeam: false },
    }),
    op('np-concurrent-push', 'updateNotificationPreferences', {
      body: { pushDue: false, mentionWorkspace: true, assignStatus: false, assignOverdue: false },
    }),
  ]);
  const mergedNp = await op('notification-preferences-merged', 'getNotificationPreferences');
  assert.deepEqual(mergedNp, {
    ...np,
    emailDigest: false,
    mentionTeam: false,
    pushDue: false,
    mentionWorkspace: true,
    assignStatus: false,
    assignOverdue: false,
  });
  const prefBootstrap = await op('preferences-bootstrap', 'getBootstrap');
  assert.deepEqual(prefBootstrap.preferences, merged);
  assert.deepEqual(prefBootstrap.notificationPreferences, mergedNp);
  const profile = await op('profile-before', 'getProfile'),
    profileUpdate = await op('profile-update', 'updateProfile', {
      body: {
        expectedVersion: profile.version,
        name: 'WU34 Current User',
        title: 'Updated title',
        avatarColor: '#123456',
      },
    });
  assert.equal(profileUpdate.email, profile.email);
  assert.equal(
    (await op('profile-member', 'getMember', { memberId: m1 })).name,
    profileUpdate.name,
  );
  assert.equal(
    (await op('profile-home-bootstrap', 'getBootstrap')).currentMember.name,
    profileUpdate.name,
  );
  const view = await op(
    'view-create',
    'createSavedView',
    {
      projectId: primary.ps[0].id,
      body: {
        name: 'WU34 saved',
        type: 'board',
        filters: [{ field: 'priority', op: 'is', values: ['high'] }],
      },
    },
    201,
  );
  assert.equal(view.createdBy, m1);
  assert.equal(view.version, 1);
  const [va, vb] = await Promise.all([
    op(
      'view-concurrent-a',
      'createSavedView',
      { projectId: primary.ps[0].id, body: { name: 'Concurrent A', type: 'list' } },
      201,
    ),
    op(
      'view-concurrent-b',
      'createSavedView',
      { projectId: primary.ps[0].id, body: { name: 'Concurrent B', type: 'table' } },
      201,
    ),
  ]);
  assert.notEqual(va.position, vb.position);
  const updated = await op('view-update', 'updateSavedView', {
    viewId: view.id,
    body: { expectedVersion: 1, name: 'Changed shared view', filters: [] },
  });
  assert.equal(updated.version, 2);
  await zero('view-stale', () =>
    op(
      'view-stale-update',
      'updateSavedView',
      { viewId: view.id, body: { expectedVersion: 1, name: 'Lost' } },
      409,
    ),
  );
  await op('view-delete', 'deleteSavedView', {
    viewId: va.id,
    body: { expectedVersion: va.version },
  });
  assert(
    !(await op('view-list-after-delete', 'listSavedViews', { projectId: primary.ps[0].id })).some(
      (v) => v.id === va.id,
    ),
  );
  const favoriteId = primary.ps[0].id;
  await op('favorite-add', 'addProjectFavorite', { projectId: favoriteId });
  await zero('favorite-idempotent', () =>
    op('favorite-repeat', 'addProjectFavorite', { projectId: favoriteId }),
  );
  await zero('favorite-lost-actor', async () => {
    await op(
      'favorite-noop-lost-actor',
      'addProjectFavorite',
      { projectId: favoriteId },
      409,
      actorInjection,
    );
    const inner = await request('favorite-lost-actor-observation', '/__wu34/injection');
    assert.deepEqual(inner.before, inner.after);
  });
  assert.equal(
    (await op('favorite-bootstrap', 'getBootstrap')).projects.find(
      (p) => p.project.id === favoriteId,
    ).project.isFavorite,
    true,
  );
  await op('favorite-remove', 'removeProjectFavorite', { projectId: favoriteId });
  await zero('favorite-remove-idempotent', () =>
    op('favorite-remove-repeat', 'removeProjectFavorite', { projectId: favoriteId }),
  );
  const orderIds = [primary.ps[1].id, privateId, primary.ps[0].id];
  await op('order-update', 'updateProjectOrder', { body: { projectIds: orderIds } });
  assert.deepEqual(
    (await op('order-bootstrap', 'getBootstrap')).projects.slice(0, 3).map((p) => p.project.id),
    orderIds,
  );
  await zero('mutation-rollback', async () => {
    await op(
      'preference-fk-rollback',
      'updatePreferences',
      { body: { theme: 'light' } },
      500,
      'fail',
    );
    await op(
      'view-fk-rollback',
      'createSavedView',
      { projectId: favoriteId, body: { name: 'Rollback', type: 'list' } },
      500,
      'fail',
    );
    await op(
      'order-fk-rollback',
      'updateProjectOrder',
      { body: { projectIds: [favoriteId] } },
      500,
      'fail',
    );
    await op(
      'read-fk-rollback',
      'updateNotification',
      { notificationId: readState.id, body: { read: true } },
      500,
      'fail',
    );
  });
  await zero('validation-errors', async () => {
    await op('preferences-empty', 'updatePreferences', { body: {} }, 400);
    await op(
      'preferences-unknown',
      'updatePreferences',
      { body: { name: 'not preferences' } },
      400,
    );
    await op(
      'notification-prefs-unknown',
      'updateNotificationPreferences',
      { body: { recipientId: m2 } },
      400,
    );
    await op(
      'profile-stale',
      'updateProfile',
      { body: { expectedVersion: profile.version, name: 'Stale' } },
      409,
    );
    await op(
      'order-duplicate',
      'updateProjectOrder',
      { body: { projectIds: [favoriteId, favoriteId] } },
      400,
    );
    await op(
      'order-foreign',
      'updateProjectOrder',
      { body: { projectIds: [secondary.ps[0].id] } },
      400,
    );
    await op(
      'view-actor-injected',
      'createSavedView',
      { projectId: favoriteId, body: { name: 'Invalid', type: 'list', createdBy: m2 } },
      400,
    );
    await op(
      'view-foreign',
      'updateSavedView',
      { viewId: seed.secondary.savedViews[0].id, body: { expectedVersion: 1, name: 'Foreign' } },
      404,
    );
    await op(
      'notification-private',
      'updateNotification',
      { notificationId: uid(3090), body: { read: true } },
      404,
    );
  });
  await zero('read-errors', async () => {
    await op(
      'search-bad-cursor',
      'search',
      { query: { q: 'changed', cursor: search1.nextCursor } },
      400,
    );
    await op(
      'notification-wrong-scope',
      'listNotifications',
      { query: { category: 'mention', cursor: unread.nextCursor } },
      400,
    );
    await request('archive-bad-cursor', W + '/archive?kind=tasks&cursor=not-cursor', {
      status: 400,
    });
    await request('task-malformed-filters', W + '/tasks?filters=%7B%22SQL%22%3A%22drop%22%7D', {
      status: 400,
    });
    await request('notification-bad-bool', W + '/notifications?unreadOnly=1', { status: 400 });
    await request('search-duplicate-q', W + '/search?q=x&q=y', { status: 400 });
    await request('calendar-invalid-date', W + '/calendar-events?from=2028-02-30&to=2028-03-01', {
      status: 400,
    });
    await request('calendar-reversed', W + '/calendar-events?from=2028-03-02&to=2028-03-01', {
      status: 400,
    });
    await op('private-view-list', 'listSavedViews', { projectId: privateId }, 404);
    await op(
      'private-view-create',
      'createSavedView',
      { projectId: privateId, body: { name: 'Leak', type: 'list' } },
      404,
    );
    await op(
      'private-calendar',
      'listCalendarEvents',
      { query: { from: '2000-01-01', to: '2099-01-01', projectId: privateId } },
      404,
    );
    await op('private-favorite', 'addProjectFavorite', { projectId: privateId }, 404);
  });
  // Archive covers separate archived task/project roots, tombstones and cursors
  // whose original archived anchor has been restored.
  const taskToArchive = primary.tasks[0],
    task2 = primary.tasks[2];
  await op('archive-task', 'archiveTask', {
    taskId: taskToArchive.id,
    body: { expectedVersion: 1 },
  });
  await op('archive-task2', 'archiveTask', { taskId: task2.id, body: { expectedVersion: 1 } });
  const archive1 = await op('archive-page1', 'listArchive', {
    query: { kind: 'tasks', q: 'WU34', limit: 1 },
  });
  assert.equal(archive1.total, 2);
  const anchor = archive1.items[0].task;
  await op('restore-archive-anchor', 'restoreTask', {
    taskId: anchor.id,
    body: { expectedVersion: anchor.version },
  });
  assert.equal(
    (
      await op('archive-continuation', 'listArchive', {
        query: { kind: 'tasks', q: 'WU34', limit: 1, cursor: archive1.nextCursor },
      })
    ).items.length,
    1,
  );
  const beforeProject = await op('project-before-archive', 'getProject', { projectId: favoriteId });
  const archivedProject = (
    await op('archive-project', 'archiveProject', {
      projectId: favoriteId,
      body: { expectedVersion: beforeProject.version },
    })
  ).project;
  const archiveTasks = await op('archive-active-parents', 'listArchive', {
      query: { kind: 'tasks', limit: 200 },
    }),
    archiveProjects = await op('archive-projects', 'listArchive', {
      query: { kind: 'projects', limit: 200 },
    }),
    archiveBadge = await op('archive-bootstrap', 'getBootstrap');
  assert(archiveTasks.items.every((r) => r.task.projectId !== favoriteId));
  assert.equal(archiveBadge.navigationCounts.archive, archiveTasks.total + archiveProjects.total);
  const ap = archiveProjects.items.find((r) => r.project.project.id === favoriteId);
  assert.equal(
    ap.project.summary.taskSummary.total,
    primary.tasks.filter((t) => t.projectId === favoriteId).length +
      baseAll.items.filter((t) => t.projectId === favoriteId).length,
  );
  await zero('archived-view-command', () =>
    op(
      'archived-view-update',
      'updateSavedView',
      { viewId: view.id, body: { expectedVersion: updated.version, name: 'No' } },
      409,
    ),
  );
  assert(
    !(await op('search-archived-parent', 'search', { query: { q: 'needle' } })).items.some(
      (r) => r.kind === 'tasks' && r.task.projectId === favoriteId,
    ),
  );
  assert(
    !(
      await op('calendar-archived-parent', 'listCalendarEvents', {
        query: { from: '2000-01-01', to: '2099-01-01' },
      })
    ).some((e) => e.projectId === favoriteId),
  );
  await op('restore-project', 'restoreProject', {
    projectId: favoriteId,
    body: { expectedVersion: archivedProject.version },
  });
  // A view is shared, while preferences, notifications, favorites and order are personal.
  await stop();
  await start('member', {
    LOCAL_USER_ID: sourceId('users', 'm2'),
    LOCAL_WORKSPACE_ID: seed.primary.workspaceId,
  });
  const memberPrefs = await op('member-preferences', 'getPreferences');
  assert.deepEqual(memberPrefs, prefs);
  assert(
    (await op('member-view-shared', 'listSavedViews', { projectId: favoriteId })).some(
      (v) => v.id === view.id,
    ),
  );
  const sharedEdit = await op('member-view-edit', 'updateSavedView', {
    viewId: view.id,
    body: { expectedVersion: updated.version, type: 'list' },
  });
  assert.equal(sharedEdit.createdBy, m1);
  assert.equal(sharedEdit.version, 3);
  await op('member-favorite', 'addProjectFavorite', { projectId: favoriteId });
  await op('member-order', 'updateProjectOrder', { body: { projectIds: [favoriteId] } });
  await zero('recipient-scope', () =>
    op(
      'member-notification-hidden',
      'updateNotification',
      { notificationId: readState.id, body: { read: true } },
      404,
    ),
  );
  // Give member a view-only private grant: read permitted, mutations remain404.
  await sql(
    "UPDATE projectMembers SET permission='view' WHERE workspaceId=? AND projectId=? AND memberId=?",
    [seed.primary.workspaceId, privateId, m2],
  );
  if (
    (
      await sql('SELECT 1 FROM projectMembers WHERE workspaceId=? AND projectId=? AND memberId=?', [
        seed.primary.workspaceId,
        privateId,
        m2,
      ])
    ).length === 0
  )
    await sql(
      "INSERT INTO projectMembers(workspaceId,projectId,memberId,permission) VALUES (?,?,?,'view')",
      [seed.primary.workspaceId, privateId, m2],
    );
  await op('view-only-read', 'listSavedViews', { projectId: privateId });
  await zero('view-only-write', () =>
    op(
      'view-only-rejected',
      'createSavedView',
      { projectId: privateId, body: { name: 'No edit', type: 'list' } },
      404,
    ),
  );
  await stop();
  await start('isolation', vars(seed.isolation));
  const isoHome = await op('isolation-home', 'getHome', {
      workspaceId: seed.isolation.workspaceId,
    }),
    isoSearch = await op('isolation-search', 'search', {
      workspaceId: seed.isolation.workspaceId,
      query: { q: 'secondary secret' },
    });
  assert.equal(isoSearch.total, 235);
  assert.equal(
    (
      await op('isolation-needle', 'search', {
        workspaceId: seed.isolation.workspaceId,
        query: { q: 'needle' },
      })
    ).total,
    0,
  );
  assert(isoHome.myTasks.items.every((t) => t.workspaceId === seed.isolation.workspaceId));
  assert.deepEqual(
    await op('isolation-prefs', 'getPreferences', { workspaceId: seed.isolation.workspaceId }),
    prefs,
  );
  await zero('workspace-scope', async () => {
    await op('foreign-workspace-home', 'getHome', {}, 404);
    await op('foreign-workspace-pref', 'updatePreferences', { body: { theme: 'light' } }, 404);
    await op(
      'foreign-view-id',
      'updateSavedView',
      {
        workspaceId: seed.isolation.workspaceId,
        viewId: view.id,
        body: { expectedVersion: 3, name: 'foreign' },
      },
      404,
    );
    await op(
      'foreign-project-favorite',
      'addProjectFavorite',
      { workspaceId: seed.isolation.workspaceId, projectId: favoriteId },
      404,
    );
  });
  await stop();
  await start('production-restart', vars(seed.primary), true);
  assert.deepEqual(await op('persistent-prefs', 'getPreferences'), merged);
  assert.deepEqual(
    await op('persistent-notification-prefs', 'getNotificationPreferences'),
    mergedNp,
  );
  const persisted = await op('persistent-bootstrap', 'getBootstrap');
  assert.deepEqual(
    persisted.projects.slice(0, 3).map((p) => p.project.id),
    orderIds,
  );
  assert.equal(
    persisted.projects.find((p) => p.project.id === favoriteId).project.isFavorite,
    false,
  );
  assert.equal(
    (await op('persistent-view', 'listSavedViews', { projectId: favoriteId })).find(
      (v) => v.id === view.id,
    ).type,
    'list',
  );
  assert.equal((await op('persistent-profile', 'getProfile')).name, profileUpdate.name);
  await request('no-production-test-hook', '/__wu34/snapshot', { status: 404 });
  await op('current-files-available', 'listProjectFiles', { projectId: favoriteId });
  report.acceptance = [
    'AC1: >200 rows full cursor Board/Calendar/Timeline + full summary/project/member/team/Home/Overview/search totals',
    'AC2: shared recipient list+Bootstrap/Inbox badges/read-state continuation and persisted personal preferences/notification prefs/favorites/order; shared project saved views/CAS/profile',
    'AC3: literal q, malformed filters/cursors/dates/repeated query; two disjoint scopes/private/current parent/lifecycle; view-only write rejection; actual rollback+full24table zero effects; HTTP errors never Mock fallback',
  ];
  report.multiPage = {
    primaryTasks: 235,
    secondaryTasks: 235,
    full: full.matchedCount,
    calendar: cal.matchedCount,
    timeline: timeline.matchedCount,
    search: results.length,
  };
  report.primary = seed.primary;
  report.isolation = seed.isolation;
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAILED';
  report.error = { name: error.name, message: error.message, stack: error.stack };
  throw error;
} finally {
  await harness.cleanup();
  save('report.json', report);
  console.log(
    JSON.stringify({
      status: report.status,
      commands: report.commands.length,
      probes: report.probes.length,
      snapshotPairs: report.snapshotPairs.length,
      error: report.error?.message ?? null,
    }),
  );
}
