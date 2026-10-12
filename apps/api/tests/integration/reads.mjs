import { localFetch as fetch } from '../support/harness.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHarness } from '../support/harness.mjs';
import { readFixtureSql } from '../support/read-fixtures.mjs';
import { seedRows } from '../../scripts/seed-data.mjs';
import { operations } from '@studio/contracts/api';
import { compareTaskTuple } from '@studio/domain';
const report = { status: 'RUNNING', commands: [], probes: [], matrix: [], plans: [], metrics: [] },
  h = await createHarness('reads', report),
  seed = seedRows(),
  now = Date.now();
const fixture = readFixtureSql(seed, now);
function url(scope, kind, query, projectId = scope.projectId, taskId = scope.taskId) {
  const root = '/api/v1/workspaces/' + scope.workspaceId;
  const path =
    kind === 'tasks'
      ? root + '/tasks'
      : kind === 'summary'
        ? root + '/tasks/summary'
        : kind === 'projects'
          ? root + '/projects'
          : kind === 'members'
            ? root + '/members'
            : kind === 'files'
              ? root + '/projects/' + projectId + '/files'
              : kind === 'comments'
                ? root + '/tasks/' + taskId + '/comments'
                : kind === 'activity'
                  ? root + '/activity'
                  : root + '/notifications';
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined)
      parameters.set(
        key,
        key === 'filters' ? JSON.stringify(value) : value === null ? 'null' : String(value),
      );
  return path + (parameters.size ? '?' + parameters : '');
}
const opName = {
  tasks: 'listTasks',
  summary: 'getTaskSummary',
  projects: 'listProjects',
  members: 'listMembers',
  files: 'listProjectFiles',
  comments: 'listComments',
  activity: 'listActivity',
  notifications: 'listNotifications',
};
async function get(scope, kind, query, explain = false) {
  const path = url(scope, kind, query),
    response = await fetch(h.baseUrl + path, {
      headers: explain ? { 'x-read-explain': 'yes' } : {},
    }),
    body = await response.json();
  assert.equal(response.status, 200, kind + ': ' + JSON.stringify(body));
  operations[opName[kind]].response.parse(body);
  const metrics = JSON.parse(response.headers.get('x-read-observations') ?? '[]');
  report.probes.push({ path, status: response.status });
  if (explain) {
    report.plans.push({
      kind,
      query,
      plans: JSON.parse(response.headers.get('x-read-plans') ?? '[]'),
    });
    report.metrics.push({ kind, query, observations: metrics });
  }
  return body.data;
}
async function oracle(scope, kind, query) {
  const response = await fetch(h.baseUrl + '/__reads/oracle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, query, projectId: scope.projectId, taskId: scope.taskId, now }),
  });
  assert.equal(response.status, 200, 'oracle ' + kind + ': ' + (await response.clone().text()));
  return response.json();
}
const id = (kind, item) => (kind === 'projects' ? item.project.id : item.id);
const decode = (value) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
async function mutate(path, method, body) {
  const response = await fetch(h.baseUrl + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    value = await response.json();
  assert.equal(response.status, 200, path + ': ' + JSON.stringify(value));
  report.probes.push({ name: 'native-anchor-mutation', path, status: response.status });
  return value.data;
}
async function anchorCases(scope) {
  const root = '/api/v1/workspaces/' + scope.workspaceId;
  // Compare continuation against the OLD tuple, independent of the renamed row.
  const tasks = await get(scope, 'tasks', {
    projectId: scope.projectId,
    sortField: 'title',
    limit: 7,
  });
  const taskAnchor = tasks.items.at(-1),
    taskCursor = decode(tasks.nextCursor);
  await mutate(root + '/tasks/' + taskAnchor.id, 'PATCH', {
    expectedVersion: taskAnchor.version,
    title: 'ZZ renamed task anchor',
  });
  const taskOracle = await oracle(scope, 'tasks', {
    projectId: scope.projectId,
    sortField: 'title',
  });
  const taskExpected = taskOracle.items.filter(
    (item) =>
      compareTaskTuple(
        { value: item.title.toLowerCase(), id: item.id },
        { value: taskCursor.sortValue, id: taskCursor.id },
        'asc',
      ) > 0,
  );
  assert.deepEqual(
    (
      await get(scope, 'tasks', {
        projectId: scope.projectId,
        sortField: 'title',
        limit: 7,
        cursor: tasks.nextCursor,
      })
    ).items,
    taskExpected.slice(0, 7),
  );
  for (const value of [null, 0, '\ud800']) {
    const cursor = encode({ ...taskCursor, sortValue: value });
    const expected = taskOracle.items.filter(
      (item) =>
        compareTaskTuple(
          { value: item.title.toLowerCase(), id: item.id },
          { value, id: taskCursor.id },
          'asc',
        ) > 0,
    );
    assert.deepEqual(
      (
        await get(scope, 'tasks', {
          projectId: scope.projectId,
          sortField: 'title',
          limit: 7,
          cursor,
        })
      ).items,
      expected.slice(0, 7),
    );
  }
  const projectsBefore = await oracle(scope, 'projects', { sort: 'name' }),
    projectIndex = projectsBefore.items.findIndex(
      (item) =>
        item.access === 'allowed' &&
        !item.project.archivedAt &&
        item.project.id.startsWith('019a7777'),
    );
  const projects = await get(scope, 'projects', { sort: 'name', limit: projectIndex + 1 }),
    projectAnchor = projects.items.at(-1),
    projectCursor = decode(projects.nextCursor);
  await mutate(root + '/projects/' + projectAnchor.project.id, 'PATCH', {
    expectedVersion: projectAnchor.project.version,
    name: 'ZZ renamed project anchor',
  });
  const projectsAfter = await oracle(scope, 'projects', { sort: 'name' });
  assert.deepEqual(
    (await get(scope, 'projects', { sort: 'name', limit: 11, cursor: projects.nextCursor })).items,
    projectsAfter.items
      .filter(
        (item) =>
          (item.project.name.localeCompare(projectCursor.sortValue) ||
            item.project.id.localeCompare(projectCursor.id)) > 0,
      )
      .slice(0, 11),
  );
  const membersBefore = await oracle(scope, 'members', {}),
    memberIndex = membersBefore.items.findIndex((item) => item.id === scope.memberId),
    memberPage = await get(scope, 'members', { limit: memberIndex + 1 }),
    memberCursor = decode(memberPage.nextCursor);
  const profile = await (await fetch(h.baseUrl + '/api/v1/me/profile')).json();
  await mutate('/api/v1/me/profile', 'PATCH', {
    expectedVersion: profile.data.version,
    name: 'ZZ renamed member anchor',
  });
  const membersAfter = await oracle(scope, 'members', {});
  assert.deepEqual(
    (await get(scope, 'members', { limit: 13, cursor: memberPage.nextCursor })).items,
    membersAfter.items
      .filter(
        (item) =>
          (item.name.localeCompare(memberCursor.sortValue) ||
            item.id.localeCompare(memberCursor.id)) > 0,
      )
      .slice(0, 13),
  );
  const files = await get(scope, 'files', { sort: 'name', limit: 7 }),
    fileAnchor = files.items.at(-1),
    fileCursor = decode(files.nextCursor);
  await mutate(root + '/files/' + fileAnchor.id, 'PATCH', {
    expectedVersion: fileAnchor.version,
    name: 'ZZ renamed file anchor',
  });
  const filesAfter = await oracle(scope, 'files', { sort: 'name' });
  assert.deepEqual(
    (await get(scope, 'files', { sort: 'name', limit: 11, cursor: files.nextCursor })).items,
    filesAfter.items
      .filter(
        (item) =>
          (item.name.localeCompare(fileCursor.sortValue) || item.id.localeCompare(fileCursor.id)) >
          0,
      )
      .slice(0, 11),
  );
  const commentsBefore = await oracle(scope, 'comments', {}),
    commentIndex = commentsBefore.items.findIndex((item) => item.authorId === scope.memberId),
    comments = await get(scope, 'comments', { limit: commentIndex + 1 }),
    commentAnchor = comments.items.at(-1),
    commentCursor = decode(comments.nextCursor);
  await mutate(root + '/comments/' + commentAnchor.id, 'DELETE', {
    expectedVersion: commentAnchor.version,
  });
  const commentsAfter = await oracle(scope, 'comments', {});
  assert.deepEqual(
    (await get(scope, 'comments', { limit: 13, cursor: comments.nextCursor })).items,
    commentsAfter.items
      .filter(
        (item) =>
          (item.createdAt.localeCompare(commentCursor.sortValue) ||
            item.id.localeCompare(commentCursor.id)) > 0,
      )
      .slice(0, 13),
  );
  await mutate(root + '/comments/' + commentAnchor.id + '/restore-deleted', 'POST', {
    expectedVersion: commentAnchor.version + 1,
  });
  const restored = await oracle(scope, 'comments', {});
  assert.deepEqual(
    (await get(scope, 'comments', { limit: 13, cursor: comments.nextCursor })).items,
    restored.items
      .filter(
        (item) =>
          (item.createdAt.localeCompare(commentCursor.sortValue) ||
            item.id.localeCompare(commentCursor.id)) > 0,
      )
      .slice(0, 13),
  );
  const activity = await get(scope, 'activity', { taskId: scope.taskId, limit: 7 }),
    activityAnchor = activity.items.at(-1),
    activityCursor = decode(activity.nextCursor);
  const sqlFile = resolve(h.runtime, 'retract-' + scope.workspaceId + '.sql');
  writeFileSync(
    sqlFile,
    `UPDATE activity SET revertedAt=${now} WHERE workspaceId='${scope.workspaceId}' AND id='${activityAnchor.id}';`,
  );
  await h.stopWorker();
  h.run('retract-anchor-' + scope.workspaceId, [
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
    sqlFile,
    '--json',
  ]);
  await h.start('after-retract-' + scope.workspaceId, {
    LOCAL_USER_ID: scope.userId,
    LOCAL_WORKSPACE_ID: scope.workspaceId,
  });
  const activityAfter = await oracle(scope, 'activity', { taskId: scope.taskId });
  assert.deepEqual(
    (await get(scope, 'activity', { taskId: scope.taskId, limit: 17, cursor: activity.nextCursor }))
      .items,
    activityAfter.items
      .filter(
        (item) =>
          (item.createdAt.localeCompare(activityCursor.sortValue) ||
            item.id.localeCompare(activityCursor.id)) < 0,
      )
      .slice(0, 17),
  );
  const notifications = await get(scope, 'notifications', {
      category: 'all',
      unreadOnly: true,
      limit: 7,
    }),
    notificationAnchor = notifications.items.at(-1),
    notificationCursor = decode(notifications.nextCursor);
  await mutate(root + '/notifications/' + notificationAnchor.id, 'PATCH', { read: true });
  const notificationsAfter = await oracle(scope, 'notifications', {
    category: 'all',
    unreadOnly: true,
  });
  const next = await get(scope, 'notifications', {
    category: 'all',
    unreadOnly: true,
    limit: 11,
    cursor: notifications.nextCursor,
  });
  assert.deepEqual(
    next.items,
    notificationsAfter.items
      .filter(
        (item) =>
          (item.createdAt.localeCompare(notificationCursor.sortValue) ||
            item.id.localeCompare(notificationCursor.id)) < 0,
      )
      .slice(0, 11),
  );
  assert.equal(next.unreadCount, notificationsAfter.unreadCount);
  const changed = await mutate(root + '/tasks/' + scope.taskIds[225], 'PATCH', {
    expectedVersion: 1,
    title: 'Lone \ud800 storage',
  });
  assert.equal(changed.task.title, 'Lone \ufffd\ufffd\ufffd storage');
  await parity(scope, 'tasks', { q: '\ufffd', sortField: 'title' });
  report.matrix.push({
    kind: 'anchors',
    workspace: scope.workspaceId,
    cases: [
      'task/project/member/file renamed old tuple',
      'comment tombstone',
      'notification marked read',
      'task null/numeric/unpaired old cursor',
      'D1 WTF8 read projection',
    ],
  });
}
async function parity(scope, kind, query, { traverse = false, explain = false } = {}) {
  const expected = await oracle(scope, kind, query);
  if (kind === 'summary') {
    assert.deepEqual(await get(scope, kind, query, explain), expected.summary);
    report.matrix.push({ kind, query, total: expected.total });
    return;
  }
  const limit = query.limit ?? 19,
    first = await get(scope, kind, { ...query, limit }, explain);
  assert.equal(first.total, expected.total, kind + ' total');
  assert.deepEqual(first.items, expected.items.slice(0, limit), kind + ' first page');
  if (kind === 'notifications') assert.equal(first.unreadCount, expected.unreadCount);
  if (traverse) {
    const items = [...first.items];
    let cursor = first.nextCursor;
    const seen = new Set(items.map((item) => id(kind, item)));
    let pages = 1;
    while (cursor) {
      const page = await get(scope, kind, { ...query, limit, cursor });
      assert.equal(page.total, expected.total);
      for (const item of page.items) {
        assert(!seen.has(id(kind, item)), kind + ' duplicate');
        seen.add(id(kind, item));
      }
      items.push(...page.items);
      cursor = page.nextCursor;
      if (++pages > 100) throw new Error('Nonterminating feed');
    }
    assert.deepEqual(items, expected.items, kind + ' complete traversal');
  }
  report.matrix.push({
    workspace: scope.workspaceId,
    kind,
    query,
    total: expected.total,
    traverse,
  });
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
  const file = resolve(h.runtime, 'read-fixtures.sql');
  writeFileSync(file, fixture.sql);
  h.run('read-fixtures', [
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
    await h.start('workspace-' + scope.workspaceId, {
      LOCAL_USER_ID: scope.userId,
      LOCAL_WORKSPACE_ID: scope.workspaceId,
    });
    for (const sortField of [
      'manual',
      'title',
      'due',
      'start',
      'priority',
      'status',
      'assignee',
      'created',
      'updated',
      'estimate',
      'project',
    ])
      for (const sortDirection of ['asc', 'desc'])
        await parity(
          scope,
          'tasks',
          { sortField, sortDirection, limit: 31 },
          {
            traverse: true,
            explain: sortDirection === 'asc' && ['manual', 'title', 'due'].includes(sortField),
          },
        );
    for (const query of [
      { assigneeId: null },
      { assigneeId: scope.memberIds[1] },
      { favoriteOnly: true },
      { archived: true },
      { q: 'ä' },
      { q: 'k' },
      { q: 'i\u0307' },
      { q: '%_' },
      { q: '\\' },
      { rangeFrom: '2026-10-09', rangeTo: '2026-10-25', rangeBasis: 'overlap' },
      { rangeFrom: '2026-10-19', rangeTo: '2026-10-21', rangeBasis: 'due' },
      ...['is', 'not'].flatMap((op) => [
        { filters: [{ field: 'labels', op, values: ['design'] }] },
        { filters: [{ field: 'assignee', op, values: [null, scope.memberIds[2]] }] },
        { filters: [{ field: 'status', op, values: ['done', 'progress'] }] },
        { filters: [{ field: 'priority', op, values: ['urgent', 'none'] }] },
        { filters: [{ field: 'project', op, values: [scope.projectId] }] },
        { filters: [{ field: 'due', op, values: ['week', 'nodate', 'later'] }] },
        { filters: [{ field: 'created', op, values: ['1', '7'] }] },
        { filters: [{ field: 'updated', op, values: ['7', '30'] }] },
      ]),
      {
        filters: Array.from({ length: 32 }, () => ({
          field: 'status',
          op: 'is',
          values: Array.from({ length: 50 }, () => 'todo'),
        })),
      },
    ]) {
      await parity(scope, 'tasks', query);
      await parity(scope, 'summary', query);
    }
    for (const sort of ['name', 'recent', 'due', 'progress'])
      for (const archived of [false, true])
        await parity(
          scope,
          'projects',
          { sort, archived, limit: 11 },
          { traverse: true, explain: !archived },
        );
    for (const query of [
      { q: 'ä' },
      { q: '%_' },
      { q: 'k' },
      { q: 'i\u0307' },
      { status: 'active' },
      { status: 'planning' },
    ])
      await parity(scope, 'projects', query);
    for (const query of [
      {},
      { status: 'invited' },
      { teamId: scope.teamId },
      { status: 'active' },
      { q: 'ä' },
      { q: '%_' },
      { q: 'k' },
      { q: 'i\u0307' },
    ])
      await parity(
        scope,
        'members',
        { ...query, limit: 13 },
        { traverse: true, explain: !Object.keys(query).length },
      );
    for (const sort of ['name', 'recent', 'type', 'size'])
      await parity(scope, 'files', { sort, limit: 11 }, { traverse: true, explain: true });
    for (const query of [
      { q: 'ä' },
      { q: '%_' },
      { q: 'k' },
      { q: 'i\u0307' },
      { type: 'PDF' },
      { type: 'PNG' },
      { type: 'missing' },
    ])
      await parity(scope, 'files', query);
    await parity(scope, 'comments', { limit: 13 }, { traverse: true, explain: true });
    for (const query of [
      {},
      { taskId: scope.taskId },
      { projectId: scope.projectId },
      { actorId: scope.memberId },
    ])
      await parity(
        scope,
        'activity',
        { ...query, limit: 17 },
        { traverse: true, explain: !Object.keys(query).length },
      );
    for (const category of ['all', 'mention', 'assign', 'comment', 'update'])
      for (const unreadOnly of [false, true])
        await parity(
          scope,
          'notifications',
          { category, unreadOnly, limit: 11 },
          { traverse: true, explain: category === 'all' && !unreadOnly },
        );
    const taskPage = await get(scope, 'tasks', { limit: 7, sortField: 'title' });
    assert(taskPage.nextCursor);
    const mismatch = await fetch(
      h.baseUrl +
        url(scope, 'tasks', {
          limit: 7,
          sortField: 'title',
          q: 'changed',
          cursor: taskPage.nextCursor,
        }),
    );
    assert.equal(mismatch.status, 400);
    report.probes.push({ name: 'cross-query-cursor', status: mismatch.status });
    await anchorCases(scope);
    for (const bucket of ['overdue', 'today', 'week', 'later', 'nodate'])
      for (const op of ['is', 'not'])
        await parity(scope, 'tasks', { filters: [{ field: 'due', op, values: [bucket] }] });
    await parity(scope, 'tasks', { filters: [{ field: 'status', op: 'not', values: [] }] });
  }
  assert(
    report.plans.every((item) =>
      item.plans.some((plan) => plan.some((row) => String(row.detail).includes('SEARCH'))),
    ),
    'native plans contain indexed searches',
  );
  report.status = 'PASS';
  report.acceptance = {
    matrixCases: report.matrix.length,
    httpProbes: report.probes.length,
    workspaces: 2,
    compilerParamBound: '32 filters × 50 values accepted without increasing params100',
    scope:
      'seven feeds + task summary, actual native D1; complete canonical DTO parity and full traversal',
  };
  h.save('matrix.json', report.matrix);
  h.save('query-plans.json', report.plans);
  h.save('read-metrics.json', report.metrics);
  await h.start(
    'production',
    { LOCAL_USER_ID: seed.primary.userId, LOCAL_WORKSPACE_ID: seed.primary.workspaceId },
    true,
  );
  assert.equal((await fetch(h.baseUrl + '/__reads/oracle')).status, 404);
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
