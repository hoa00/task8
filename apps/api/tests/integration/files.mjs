// Active feature scenarios adapted from WU-36; production code is imported by the Worker.
import { createHarness, hash, root } from '../support/harness.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { serveHttpBuild } from '../support/http-preview.mjs';
import { seedRows } from '../../scripts/seed-data.mjs';
import { operations, ApiErrorSchema } from '@studio/contracts/api';
import { sourceId } from '@studio/contracts/source-identities';
import { createHttpClient } from '../../../web/src/data/adapters/http.ts';
const report = {
  status: 'RUNNING',
  commands: [],
  probes: [],
  checks: [],
  runtime: 'actual Wrangler local R2+D1; actual Chromium UI',
};
const harness = await createHarness('files', report);
const { out, persist, baseUrl, save, run } = harness;
let browser = null,
  preview = null;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function start(primary, production = false) {
  await harness.start(
    production ? 'production' : primary === seed.primary ? 'owner' : 'other',
    { LOCAL_USER_ID: primary.userId, LOCAL_WORKSPACE_ID: primary.workspaceId },
    production,
  );
}
const seed = seedRows(),
  workspaceId = seed.primary.workspaceId,
  projectId = sourceId('projects', 'p1'),
  taskId = sourceId('tasks', 't1'),
  W = '/api/v1/workspaces/' + workspaceId;
let sequence = 0;
async function req(
  name,
  path,
  { method = 'GET', body, status = 200, headers = {}, binary = false } = {},
) {
  const response = await fetch(baseUrl + path, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(30000),
    }),
    bytes = Buffer.from(await response.arrayBuffer());
  const ext = binary ? 'bin' : 'json';
  writeFileSync(resolve(out, name + '.response.' + ext), bytes);
  const budget = {
      queries: Number(response.headers.get('x-wu35-queries')),
      parameters: Number(response.headers.get('x-wu35-parameters')),
    },
    value = binary ? { bytes: bytes.length, sha256: hash(bytes) } : JSON.parse(bytes),
    row = {
      name,
      path,
      method,
      status: response.status,
      headers: Object.fromEntries(response.headers),
      budget,
      response: value,
      raw: { path: name + '.response.' + ext, bytes: bytes.length, sha256: hash(bytes) },
    };
  save(name + '.json', row);
  report.probes.push(row);
  assert(
    (Array.isArray(status) ? status : [status]).includes(response.status),
    name + ': expected ' + status + ' got ' + response.status + ' ' + bytes.toString(),
  );
  assert(budget.queries <= 50 && budget.parameters <= 100);
  if (response.status >= 400) ApiErrorSchema.parse(value);
  return binary ? { bytes, response } : value;
}
async function op(
  name,
  key,
  { body, workspaceId = seed.primary.workspaceId, ...ids } = {},
  status = 200,
  headers = {},
) {
  let path = operations[key].path.replace('{workspaceId}', workspaceId);
  for (const [field, value] of Object.entries(ids))
    path = path.replace('{' + field + '}', encodeURIComponent(value));
  const result = await req(name, path, {
    method: operations[key].method,
    ...(body
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }
      : { headers }),
    status,
  });
  if (status < 400) operations[key].response.parse(result);
  return result.data;
}
const sql = (query, parameters = []) =>
    req('sql-' + ++sequence, '/__wu35/sql', {
      method: 'POST',
      body: JSON.stringify({ sql: query, parameters }),
      headers: { 'content-type': 'application/json' },
    }).then((r) => r.results),
  objects = () => req('objects-' + ++sequence, '/__wu35/objects').then((r) => r.objects),
  check = (name) => report.checks.push(name);
const payload = Buffer.from('WU35 actual file bytes\nUnicode: Tiếng Việt\n'),
  key = () => crypto.randomUUID();
async function upload(
  name,
  {
    requestId = key(),
    bytes = payload,
    fileName = 'wu35.txt',
    mime = 'text/plain',
    project = projectId,
    task = taskId,
    status = 201,
    fault,
    barrier,
  } = {},
) {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: mime }), fileName);
  form.set('clientRequestId', requestId);
  if (task) form.set('taskId', task);
  const input = {
    requestId,
    bytes: bytes.length,
    sha256: hash(bytes),
    fileName,
    mime,
    project,
    task,
  };
  save(name + '.input.json', input);
  const result = await req(name, W + '/projects/' + project + '/files', {
    method: 'POST',
    body: form,
    status,
    headers: {
      ...(fault ? { 'x-wu35-test': fault, 'x-wu35-request': requestId } : {}),
      ...(barrier ? { 'x-wu35-barrier': barrier } : {}),
    },
  });
  if (result.data) operations.uploadProjectFile.response.parse(result);
  return { file: result.data, requestId };
}
async function content(name, id, expected = payload) {
  const value = await req(name, W + '/files/' + id + '/content', { binary: true });
  assert.equal(hash(value.bytes), hash(expected));
  return value;
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
  await start(seed.primary);
  await objects();
  const projectOnly = await upload('project-only', {
    task: null,
    fileName: 'README',
    mime: 'application/octet-stream',
  });
  assert.equal(projectOnly.file.taskId, null);
  const extensionless = await op('extensionless-duplicate', 'duplicateFile', {
    fileId: projectOnly.file.id,
    body: { expectedVersion: 1 },
  });
  assert.equal(extensionless.name, 'README');
  const renamedType = await op('rename-type', 'renameFile', {
    fileId: extensionless.id,
    body: { expectedVersion: 1, name: 'renamed.csv' },
  });
  assert.equal(renamedType.fileType, 'sheet');
  await content('project-only-copy-bytes', extensionless.id);
  const sampleOriginal = seed.rows.files.find((f) => f.projectId === projectId),
    sampleObjects = await objects(),
    sampleDuplicate = await op('sample-duplicate', 'duplicateFile', {
      fileId: sampleOriginal.id,
      body: { expectedVersion: sampleOriginal.version },
    });
  assert.equal(sampleDuplicate.storageMode, 'sample');
  assert.equal(sampleDuplicate.contentAvailable, false);
  assert.deepEqual(await objects(), sampleObjects);
  check(
    'Project-only parent guard; canonical extensionless naming/rename type; sample provenance remains metadata-only',
  );
  const first = await upload('actual-upload');
  await content('actual-content', first.file.id);
  const row = (await sql('SELECT * FROM files WHERE id=?', [first.file.id]))[0];
  assert.equal(row.contentSha256, hash(payload));
  assert.equal(row.sizeBytes, payload.length);
  assert((await objects()).some((o) => o.key === row.objectKey));
  assert.equal(
    Object.keys(row).some((k) => /bytes|base64/iu.test(k) && k !== 'sizeBytes'),
    false,
  );
  check('Actual multipart bytes/checksum/R2-D1 linkage; no bytes in D1');
  const detail = await op('drawer-file', 'getTask', { taskId });
  assert(detail.attachments.some((f) => f.id === first.file.id));
  assert(
    (await req('project-files', W + '/projects/' + projectId + '/files')).data.items.some(
      (f) => f.id === first.file.id,
    ),
  );
  const replay = await upload('upload-replay', { requestId: first.requestId, status: 200 });
  assert.equal(replay.file.id, first.file.id);
  await upload('intent-byte-mismatch', {
    requestId: first.requestId,
    bytes: Buffer.from('changed'),
    status: 409,
  });
  await upload('intent-name-mismatch', {
    requestId: first.requestId,
    fileName: 'different.txt',
    status: 409,
  });
  assert.equal(
    (await sql('SELECT count(*) n FROM files WHERE uploadRequestId=?', [first.requestId]))[0].n,
    1,
  );
  check('Stable same-key replay identity and normalized payload mismatch409');
  const renamed = await op('rename', 'renameFile', {
    fileId: first.file.id,
    body: { expectedVersion: first.file.version, name: 'renamed.txt' },
  });
  assert.equal(
    (await op('drawer-renamed', 'getTask', { taskId })).attachments.find(
      (f) => f.id === first.file.id,
    ).name,
    'renamed.txt',
  );
  assert.equal(
    (await upload('replay-after-rename', { requestId: first.requestId, status: 200 })).file.name,
    'renamed.txt',
  );
  await content('rename-bytes', first.file.id);
  const dup = await op('duplicate', 'duplicateFile', {
    fileId: first.file.id,
    body: { expectedVersion: renamed.version },
  });
  await content('duplicate-bytes', dup.id);
  const dr = (await sql('SELECT * FROM files WHERE id=?', [dup.id]))[0];
  assert.notEqual(dr.objectKey, row.objectKey);
  assert.equal(dr.uploadRequestId, null);
  check('Rename retains bytes/original-intent hash; duplicate independent object');
  const dupAck = await op(
    'duplicate-ack',
    'duplicateFile',
    { fileId: dup.id, body: { expectedVersion: dup.version } },
    200,
    { 'x-wu35-test': 'ack' },
  );
  await content('duplicate-ack-bytes', dupAck.id);
  const dupRollbackBefore = await objects();
  await op(
    'duplicate-rollback',
    'duplicateFile',
    { fileId: dup.id, body: { expectedVersion: dup.version } },
    500,
    { 'x-wu35-test': 'rollback' },
  );
  assert.deepEqual(await objects(), dupRollbackBefore);
  check('Duplicate actual-byte copy applies owned-object rollback/committed-ACK preservation');
  const dupUnknownBefore = await objects(),
    dupMetadataBefore = (await sql('SELECT count(*) n FROM files'))[0].n;
  await op(
    'duplicate-put-lost-ack',
    'duplicateFile',
    { fileId: dup.id, body: { expectedVersion: dup.version } },
    500,
    { 'x-wu35-test': 'r2-put-ack' },
  );
  assert.equal((await objects()).length, dupUnknownBefore.length + 1);
  assert.equal((await sql('SELECT count(*) n FROM files'))[0].n, dupMetadataBefore);
  const dupD1Before = (await sql('SELECT id FROM files')).map((f) => f.id);
  await op(
    'duplicate-d1-read-lost-ack',
    'duplicateFile',
    { fileId: dup.id, body: { expectedVersion: dup.version } },
    500,
    { 'x-wu35-test': 'ack-readfail' },
  );
  const dupCommitted = (await sql('SELECT * FROM files')).find((f) => !dupD1Before.includes(f.id));
  assert(dupCommitted);
  assert((await objects()).some((o) => o.key === dupCommitted.objectKey));
  await content('duplicate-unconfirmed-committed-content', dupCommitted.id);
  check(
    'Duplicate lost R2 ACK and D1 ACK+read failure preserve/log copy IDs and bytes; no false success',
  );
  const deleted = await op('delete', 'deleteFile', {
    fileId: first.file.id,
    body: { expectedVersion: renamed.version },
  });
  await req('deleted-content', W + '/files/' + first.file.id + '/content', { status: 404 });
  assert((await objects()).some((o) => o.key === row.objectKey));
  assert(
    !(await op('drawer-deleted', 'getTask', { taskId })).attachments.some(
      (f) => f.id === first.file.id,
    ),
  );
  const undone = await op('undo', 'undoCommand', { undoId: deleted.undo.id, body: {} });
  assert.deepEqual(
    await op('undo-replay', 'undoCommand', { undoId: deleted.undo.id, body: {} }),
    undone,
  );
  await content('undo-content', first.file.id);
  check('Tombstone retains R2 bytes; bounded one-shot current-parent Undo');
  // One bounded regression group: actual same-Undo winner then final actor/grant revocation.
  for (const [kind, status] of [
    ['actor', 409],
    ['grant', 403],
  ]) {
    const pendingFile = await upload('undo-race-' + kind + '-upload'),
      pendingRow = (await sql('SELECT * FROM files WHERE id=?', [pendingFile.file.id]))[0],
      pendingDelete = await op('undo-race-' + kind + '-delete', 'deleteFile', {
        fileId: pendingFile.file.id,
        body: { expectedVersion: pendingFile.file.version },
      });
    const blocked = op(
      'undo-race-' + kind + '-rejected',
      'undoCommand',
      { undoId: pendingDelete.undo.id, body: {} },
      status,
      {
        'x-wu35-test': 'undo-winner-' + kind,
        'x-wu35-undo': pendingDelete.undo.id,
        'x-wu35-project': projectId,
      },
    );
    let arrived = false;
    for (let i = 0; i < 20; i++) {
      if (
        (await req('undo-race-' + kind + '-pending-' + i, '/__wu35/undo-pending')).undoId ===
        pendingDelete.undo.id
      ) {
        arrived = true;
        break;
      }
      await wait(10);
    }
    assert(arrived);
    const winner = await op('undo-race-' + kind + '-winner', 'undoCommand', {
      undoId: pendingDelete.undo.id,
      body: {},
    });
    await blocked;
    const inner = await req('undo-race-' + kind + '-inner24', '/__wu35/observation');
    assert.equal(Object.keys(inner.before).length, 24);
    assert.deepEqual(inner.before, inner.after);
    const record = inner.before.commandUndoRecords.find((r) => r.id === pendingDelete.undo.id);
    assert(record.resultJson);
    assert.deepEqual(JSON.parse(record.resultJson), winner);
    assert.equal(
      (
        await sql('SELECT resultJson FROM commandUndoRecords WHERE id=?', [pendingDelete.undo.id])
      )[0].resultJson,
      record.resultJson,
    );
    assert((await objects()).some((o) => o.key === pendingRow.objectKey));
    await content('undo-race-' + kind + '-winner-bytes', pendingFile.file.id);
    assert.deepEqual(
      await op('undo-race-' + kind + '-authorized-replay', 'undoCommand', {
        undoId: pendingDelete.undo.id,
        body: {},
      }),
      winner,
    );
  }
  check(
    'Actual same-Undo concurrency: committed winner result/bytes retained; pending actor409 or grant403 rejection has full24-table no production effects; authorized replay returns immutable stored result',
  );
  const delete2 = await op('delete-for-conflict', 'deleteFile', {
    fileId: first.file.id,
    body: { expectedVersion: deleted.file.version + 1 },
  });
  await upload('parent-version-change');
  await op('undo-parent-conflict', 'undoCommand', { undoId: delete2.undo.id, body: {} }, 409);
  await op('restore-deleted', 'restoreDeletedFile', {
    fileId: first.file.id,
    body: { expectedVersion: delete2.file.version },
  });
  await content('restore-bytes', first.file.id);
  const beforeFailures = await objects(),
    fileCount = (await sql('SELECT count(*) n FROM files'))[0].n;
  await upload('r2-put-failure', { fault: 'r2-put', status: 500 });
  assert.deepEqual(await objects(), beforeFailures);
  await upload('sql-confirmed-rollback', { fault: 'rollback', status: 500 });
  assert.deepEqual(await objects(), beforeFailures);
  assert.equal((await sql('SELECT count(*) n FROM files'))[0].n, fileCount);
  check('Actual native SQL rollback cleans only owned object; R2 failure no ready metadata');
  const cleanupKey = key(),
    beforeCleanup = await objects();
  await upload('cleanup-failure-unresolved', {
    requestId: cleanupKey,
    fault: 'cleanup-rollback',
    status: 500,
  });
  assert.equal((await objects()).length, beforeCleanup.length + 1);
  assert.equal(
    (await sql('SELECT count(*) n FROM files WHERE uploadRequestId=?', [cleanupKey]))[0].n,
    0,
  );
  await upload('cleanup-failure-intent-retry', { requestId: cleanupKey });
  check(
    'Cleanup failure leaves recorded unresolved owned object; returns error and truthful retry, no orphan-free promise',
  );
  const ack = await upload('lost-ack-after-commit', { fault: 'ack', status: 200 });
  await content('ack-bytes-preserved', ack.file.id);
  assert.equal(
    (await upload('ack-retry', { requestId: ack.requestId, status: 200 })).file.id,
    ack.file.id,
  );
  const unknownKey = key();
  await upload('ack-readfail', { requestId: unknownKey, fault: 'ack-readfail', status: 500 });
  const unknownRow = (await sql('SELECT * FROM files WHERE uploadRequestId=?', [unknownKey]))[0];
  assert(unknownRow);
  assert((await objects()).some((o) => o.key === unknownRow.objectKey));
  await content('unknown-committed-bytes', unknownRow.id);
  assert.equal(
    (await upload('unknown-retry', { requestId: unknownKey, status: 200 })).file.id,
    unknownRow.id,
  );
  check('Actual commit then lost ACK/read failure preserves committed bytes and identity');
  const pendingKey = key(),
    prior = await objects();
  await upload('pending-negative-read', { requestId: pendingKey, fault: 'pending', status: 500 });
  assert.equal(
    (await sql('SELECT count(*) n FROM files WHERE uploadRequestId=?', [pendingKey]))[0].n,
    0,
  );
  const preserved = await objects();
  assert.equal(preserved.length, prior.length + 1);
  await req('pending-actual-finish', '/__wu35/flush');
  const pendingRow = (await sql('SELECT * FROM files WHERE uploadRequestId=?', [pendingKey]))[0];
  assert(pendingRow);
  await content('pending-late-commit-bytes', pendingRow.id);
  assert.equal(
    (await upload('pending-retry', { requestId: pendingKey, status: 200 })).file.id,
    pendingRow.id,
  );
  check(
    'Negative read not rollback proof: pending ambiguity retained; actual late D1 commit/retry resolves same file',
  );
  const concurrentKey = key(),
    preConcurrent = await objects(),
    concurrent = await Promise.all([
      upload('concurrent-a', {
        requestId: concurrentKey,
        barrier: concurrentKey,
        status: [200, 201],
      }),
      upload('concurrent-b', {
        requestId: concurrentKey,
        barrier: concurrentKey,
        status: [200, 201],
      }),
    ]);
  assert.equal(concurrent[0].file.id, concurrent[1].file.id);
  assert.equal((await objects()).length, preConcurrent.length + 1);
  await content('concurrent-winner-preserved', concurrent[0].file.id);
  check('Concurrent attempts own unique keys; native unique winner; confirmed loser-only cleanup');
  const actorKey = key(),
    actorObjects = await objects();
  await Promise.all([
    upload('winner-actor-invalid-loser', {
      requestId: actorKey,
      barrier: actorKey,
      status: 409,
      fault: 'winner-actor',
    }),
    upload('winner-actor-committed', {
      requestId: actorKey,
      barrier: actorKey,
      status: [201, 409],
    }),
  ]);
  const actorObservation = await req('winner-actor-inner24', '/__wu35/observation');
  assert.equal(Object.keys(actorObservation.before).length, 24);
  assert.deepEqual(actorObservation.before, actorObservation.after);
  assert.equal((await objects()).length, actorObjects.length + 1);
  const actorWinner = (await sql('SELECT * FROM files WHERE uploadRequestId=?', [actorKey]))[0];
  assert(actorWinner);
  await content('invalid-actor-winning-bytes-preserved', actorWinner.id);
  assert.equal(
    (await upload('actor-restored-intent-replay', { requestId: actorKey, status: 200 })).file.id,
    actorWinner.id,
  );
  check(
    'Actual final-boundary actor invalidation: no-op loser returns409, full24-table production no effects, winning bytes retained/current-authorized replay',
  );
  await upload('fake-image-type', { mime: 'image/png', status: 400 });
  await upload('oversize', { bytes: Buffer.alloc(10485761), status: 413 });
  await upload('private-upload', { project: sourceId('projects', 'p6'), task: null, status: 404 });
  await upload('wrong-task-project', {
    task: seed.rows.tasks.find((t) => t.projectId !== projectId).id,
    status: 404,
  });
  await req(
    'foreign-content',
    '/api/v1/workspaces/' + seed.isolation.workspaceId + '/files/' + first.file.id + '/content',
    { status: 404 },
  );
  const sample = seed.rows.files.find((f) => f.projectId === projectId);
  await req('sample-no-fabricated-bytes', W + '/files/' + sample.id + '/content', { status: 404 });
  check('Size/type/private/foreign/task scope and original sample unavailable');
  const active = await op('get-for-delete-replay', 'getFile', { fileId: ack.file.id });
  await op('delete-ack', 'deleteFile', {
    fileId: ack.file.id,
    body: { expectedVersion: active.version },
  });
  await upload('deleted-intent-replay', { requestId: ack.requestId, status: 404 });
  const missing = await upload('upload-for-missing-undo'),
    missingRow = (await sql('SELECT * FROM files WHERE id=?', [missing.file.id]))[0],
    missingDelete = await op('delete-for-missing-undo', 'deleteFile', {
      fileId: missing.file.id,
      body: { expectedVersion: missing.file.version },
    });
  await req('remove-real-object', '/__wu35/remove-object', {
    method: 'POST',
    body: JSON.stringify({ key: missingRow.objectKey }),
    headers: { 'content-type': 'application/json' },
  });
  const missingBefore = (await req('missing-undo-before', '/__wu35/snapshot')).rows;
  await op('undo-missing-bytes', 'undoCommand', { undoId: missingDelete.undo.id, body: {} }, 500);
  await op(
    'restore-missing-bytes',
    'restoreDeletedFile',
    { fileId: missing.file.id, body: { expectedVersion: missingDelete.file.version } },
    500,
  );
  assert.deepEqual((await req('missing-undo-after', '/__wu35/snapshot')).rows, missingBefore);
  check('Missing actual R2 object blocks Undo/Restore with full24-table no-effects');
  const adapter = createHttpClient({ fetch: (path, options) => fetch(baseUrl + path, options) });
  const ar = await adapter.execute('uploadProjectFile', {
    workspaceId,
    projectId,
    body: {
      clientRequestId: key(),
      taskId,
      file: { name: 'adapter.txt', mimeType: 'text/plain', bytes: new Uint8Array(payload) },
    },
  });
  assert.equal(
    hash(
      (
        await adapter.execute('getFileContent', {
          workspaceId,
          fileId: ar.data.id,
          query: { disposition: 'inline' },
        })
      ).bytes,
    ),
    hash(payload),
  );
  check('Current HttpAdapter actual multipart + typed content DTO');
  // HTTP browser serves the actual selected HTTP build, proxies to current Worker.
  run('build-http', ['pnpm', '--filter', '@studio/web', 'build:http'], root);
  await sql(
    "UPDATE memberPreferences SET preferencesJson=json_set(preferencesJson,'$.lang','en') WHERE memberId=?",
    [seed.primary.memberId],
  );
  preview = await serveHttpBuild(baseUrl);
  browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(preview.url + '/w/' + workspaceId + '/projects/' + projectId + '/files');
  await page.waitForSelector('[data-files-ready]');
  const uiName = 'browser-upload.txt';
  let releaseUpload;
  const held = new Promise((resolve) => (releaseUpload = resolve));
  await page.route('**/api/v1/workspaces/*/projects/*/files', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });
  await page
    .getByLabel('Upload project files', { exact: true })
    .setInputFiles({ name: uiName, mimeType: 'text/plain', buffer: payload });
  await page.getByRole('progressbar', { name: uiName, exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('progressbar', { name: uiName, exact: true })
      .getAttribute('aria-valuenow'),
    null,
  );
  const indeterminateWidth = await page
    .getByRole('progressbar', { name: uiName, exact: true })
    .evaluate((el) => ({
      track: el.getBoundingClientRect().width,
      bar: el.firstElementChild.getBoundingClientRect().width,
    }));
  assert(indeterminateWidth.bar > 0 && indeterminateWidth.bar < indeterminateWidth.track);
  writeFileSync(
    resolve(out, 'ui-indeterminate-geometry.json'),
    JSON.stringify({ measuredProgress: false, ...indeterminateWidth }, null, 2) + '\n',
  );
  assert.equal(
    await page.getByRole('button', { name: 'Preview ' + uiName, exact: true }).count(),
    0,
  );
  await page.screenshot({ path: resolve(out, 'ui-indeterminate-pending.png') });
  releaseUpload();
  await page.getByRole('button', { name: 'Preview ' + uiName, exact: true }).waitFor();
  const ui = (await sql('SELECT * FROM files WHERE name=?', [uiName]))[0];
  await page.reload();
  await page.getByRole('button', { name: 'Preview ' + uiName, exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const dl = await download;
  const downloaded = readFileSync(await dl.path());
  assert.equal(hash(downloaded), hash(payload));
  await page.screenshot({ path: resolve(out, 'ui-upload-download.png') });
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.unroute('**/api/v1/workspaces/*/projects/*/files');
  check('Actual UI upload, reload, shared FileCard preview and downloaded checksum');
  // Native TaskForm partial: one attachment failure, same request IDs on retry.
  const calls = [];
  let fail = true;
  await page.route('**/api/v1/workspaces/*/projects/*/files', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const raw = route.request().postDataBuffer(),
      text = raw?.toString() ?? '',
      requestId = text.match(/name="clientRequestId"\r\n\r\n([^\r]+)/)?.[1];
    calls.push({
      path: route.request().url(),
      requestId,
      bodySha256: hash(raw ?? Buffer.alloc(0)),
      file: text.includes('partial-fail.txt') ? 'fail' : 'ok',
    });
    if (fail && text.includes('partial-fail.txt')) {
      fail = false;
      return route.continue({ headers: { ...route.request().headers(), 'x-wu35-test': 'r2-put' } });
    }
    return route.continue();
  });
  const taskCreates = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/tasks')) taskCreates.push(r.postData());
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Create new', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Task/ }).click();
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('WU35 UI partial task');
  await page.getByLabel('Attach files', { exact: true }).setInputFiles([
    { name: 'partial-ok.txt', mimeType: 'text/plain', buffer: payload },
    { name: 'partial-fail.txt', mimeType: 'text/plain', buffer: Buffer.from('second file') },
  ]);
  await page.getByRole('switch').click();
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await page.locator('[data-file-intent][data-status=failed]').waitFor();
  assert.equal(taskCreates.length, 1);
  assert.equal(await page.locator('[data-file-intent][data-status=failed]').count(), 1);
  assert.equal(await page.locator('[data-file-intent][data-status=attached]').count(), 1);
  assert.equal(
    await page.getByRole('textbox', { name: 'Task name', exact: true }).inputValue(),
    'WU35 UI partial task',
  );
  await page.screenshot({ path: resolve(out, 'ui-partial-failure.png') });
  const beforeMismatch = calls.length;
  await page.getByLabel('Select files again to retry', { exact: true }).setInputFiles({
    name: 'partial-fail.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('second fail'),
  });
  await page
    .getByText('Select the same file name, type and content to retry this attachment', {
      exact: true,
    })
    .waitFor();
  assert.equal(calls.length, beforeMismatch);
  await page.getByRole('button', { name: 'Retry failed', exact: true }).click();
  await page.waitForFunction(
    () => globalThis.document.querySelector('#task-form-name')?.value === '',
  );
  assert.equal(taskCreates.length, 1);
  const failedCalls = calls.filter((c) => c.file === 'fail');
  assert.equal(failedCalls.length, 2);
  assert.equal(failedCalls[0].requestId, failedCalls[1].requestId);
  const created = await sql("SELECT * FROM tasks WHERE title='WU35 UI partial task'");
  assert.equal(created.length, 1);
  const attached = await sql('SELECT * FROM files WHERE taskId=?', [created[0].id]);
  assert.equal(attached.length, 2);
  assert(attached.every((f) => f.uploadRequestId));
  save('ui-requests.json', {
    calls,
    taskCreates,
    taskId: created[0].id,
    fileIds: attached.map((f) => f.id),
    errors,
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto(
    preview.url + '/w/' + workspaceId + '/projects/' + projectId + '/files?taskId=' + created[0].id,
  );
  await page.waitForSelector('[data-task-attachments]');
  for (const file of attached)
    await page.locator('[data-attachment-id="' + file.id + '"]').waitFor();
  await page.screenshot({ path: resolve(out, 'ui-task-drawer-attachments.png') });
  assert.deepEqual(errors, []);
  check(
    'Native TaskForm multiple files/one failure: retains task+draft+IDs; Retry only failed, Create more resets only whole batch success',
  );
  await context.close();
  await browser.close();
  browser = null;
  await preview?.close();
  preview = null;
  await harness.stopWorker();
  await start(seed.primary, true);
  await content('production-restart-bytes', ui.id);
  await req('production-no-test-hook', '/__wu35/objects', { status: 404 });
  check('Production restart retains metadata/actual R2 bytes; test hooks absent');
  await harness.stopWorker();
  report.status = 'PASS';
  save('report.json', report);
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.length,
      checks: report.checks.length,
    }),
  );
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack);
  save('report.json', report);
  throw error;
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      await preview?.close();
    } finally {
      await harness.cleanup();
    }
  }
  save('report.json', report);
}
