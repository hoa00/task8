import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBrowserServer } from './browser-server.mjs';
import { withBrowserSession } from './browser-session.mjs';
import { createBrowserReport, browserResults } from './browser-report.mjs';
import { implementationFileHashes } from '../visual/teams/assets.mjs';
import { decodeOperation } from './http-intercept.mjs';

const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'browser-support-'));
  writeFileSync(join(directory, 'index.html'), '<h1>Owned server</h1>');
  return { directory, clean: () => rmSync(directory, { recursive: true, force: true }) };
};
test('server rejects missing build and live port collision without stopping the existing owner', async () => {
  const f = fixture();
  let server;
  try {
    await assert.rejects(
      startBrowserServer({ directory: f.directory, fallback: 'missing.html' }),
      /Build/,
    );
    server = await startBrowserServer({ directory: f.directory });
    await assert.rejects(
      startBrowserServer({ directory: f.directory, port: Number(new URL(server.origin).port) }),
      /EADDRINUSE/,
    );
    assert.equal(await (await fetch(server.origin)).text(), '<h1>Owned server</h1>');
  } finally {
    await server?.stop();
    f.clean();
  }
});
test('session releases earlier servers when later startup or browser launch fails', async () => {
  const f = fixture();
  const occupied = await startBrowserServer({ directory: f.directory });
  const port = Number(new URL(occupied.origin).port);
  await occupied.stop();
  try {
    await assert.rejects(
      withBrowserSession(
        {
          servers: [
            { directory: f.directory, port },
            { directory: f.directory, fallback: 'missing.html' },
          ],
        },
        () => assert.fail(),
      ),
      /Build/,
    );
    const reused = await startBrowserServer({ directory: f.directory, port });
    await reused.stop();
    await assert.rejects(
      withBrowserSession(
        {
          servers: [{ directory: f.directory, port }],
          launch: async () => {
            throw Error('launch failed');
          },
        },
        () => assert.fail(),
      ),
      /launch failed/,
    );
    const after = await startBrowserServer({ directory: f.directory, port });
    await after.stop();
  } finally {
    f.clean();
  }
});
for (const mode of ['timeout', 'cancel'])
  test(`session ${mode} closes browser and owned server`, async () => {
    const f = fixture(),
      controller = new AbortController();
    let origin,
      closed = false;
    try {
      await assert.rejects(
        withBrowserSession(
          {
            servers: [{ directory: f.directory }],
            timeoutMs: 20,
            signal: controller.signal,
            launch: async () => ({
              close: async () => {
                closed = true;
              },
            }),
          },
          (resources) => {
            origin = resources.servers[0].origin;
            if (mode === 'cancel') controller.abort(Error('cancel fixture'));
            return new Promise(() => {});
          },
        ),
        mode === 'cancel' ? /cancel fixture/ : /timed out/,
      );
      assert.equal(closed, true);
      await assert.rejects(fetch(origin));
      const reused = await startBrowserServer({
        directory: f.directory,
        port: Number(new URL(origin).port),
      });
      await reused.stop();
    } finally {
      f.clean();
    }
  });
test('browser reports record selected skips, failed scenarios and reject duplicates or incomplete results', async () => {
  const f = fixture();
  try {
    const run = createBrowserReport(f.directory);
    await run.probe('one', async () => ({ actual: true }));
    await run.probe('two', () => assert.fail(), { skip: 'remaining-selection' });
    assert.equal(run.finish().status, 'partial');
    assert.equal(browserResults(run.report).scenarios[1].status, 'skipped');
    await assert.rejects(
      run.probe('one', () => {}),
      /Duplicate/,
    );
    await assert.rejects(
      run.probe('failure', () => {
        throw Error('real failure');
      }),
      /real failure/,
    );
    assert.equal(run.finish().status, 'failed');
    assert.equal(
      JSON.parse(readFileSync(join(f.directory, 'report.json'))).probes[2].status,
      'failed',
    );
    assert.throws(() => browserResults({ status: 'running' }), /incomplete/);
    assert.throws(() => browserResults({ status: 'passed', probes: [] }), /Invalid/);
  } finally {
    f.clean();
  }
});
test('HTTP interceptor matches canonical operations, decodes path and typed query, rejects unknown paths', () => {
  const request = (url, method = 'GET', body = null) => ({
    url: () => 'http://localhost' + url,
    method: () => method,
    postData: () => body && JSON.stringify(body),
    postDataJSON: () => body,
  });
  const read = decodeOperation(
    request('/api/v1/workspaces/w/tasks?limit=2&archived=true&filters=%5B%5D'),
  );
  assert.equal(read.id, 'listTasks');
  assert.deepEqual(read.input.query, { limit: 2, archived: true, filters: [] });
  const write = decodeOperation(request('/api/v1/workspaces/w/teams', 'POST', { name: 'Home' }));
  assert.equal(write.id, 'createTeam');
  assert.equal(write.input.body.name, 'Home');
  assert.throws(() => decodeOperation(request('/api/v1/unknown')), /Unknown contract operation/);
});

test('implementation asset inventory records missing tracked paths and detects deletion or recreation', () => {
  const f = fixture(),
    live = join(f.directory, 'index.html'),
    removed = join(f.directory, 'removed.ts');
  try {
    const before = implementationFileHashes([live, removed]);
    assert.equal(before[removed], null);
    assert.equal(typeof before[live], 'string');
    rmSync(live);
    const after = implementationFileHashes([live, removed]);
    assert.equal(after[live], null);
    assert.notDeepEqual(before, after);
    writeFileSync(removed, 'new implementation');
    assert.notDeepEqual(implementationFileHashes([live, removed]), after);
  } finally {
    f.clean();
  }
});
