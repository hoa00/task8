import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../../../', import.meta.url));
export const api = resolve(root, 'apps/api');
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// CLI/build fixtures can block Node's event loop past the Workerd idle timeout.
// Each local request finishes its own socket; do not retry writes or reuse an idle one.
export function localFetch(input, init = {}) {
  const headers = new Headers(
    init.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.set('connection', 'close');
  return globalThis.fetch(input, { ...init, headers });
}

export async function freePort() {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const port = server.address().port;
  await new Promise((accept, reject) =>
    server.close((error) => (error ? reject(error) : accept())),
  );
  return port;
}

// Literal dotenv quoting preserves server-only JSON and multiline PEM fixture values.
export function privateVarsText(secrets) {
  return (
    Object.entries(secrets)
      .map(([key, value]) => {
        if (
          !/^[A-Z][A-Z0-9_]*$/u.test(key) ||
          typeof value !== 'string' ||
          value.includes('\r') ||
          value.includes('\0')
        )
          throw new TypeError('Invalid private fixture variable');
        const quote = !value.includes("'") ? "'" : !value.includes('`') ? '`' : undefined;
        if (!quote) throw new TypeError('Unsupported private fixture secret encoding');
        return key + '=' + quote + value + quote;
      })
      .join('\n') + '\n'
  );
}

export async function createHarness(feature, report) {
  const outputRoot = resolve(process.env.API_TEST_OUTPUT_DIR ?? resolve(root, 'test-results/api'));
  mkdirSync(outputRoot, { recursive: true });
  const out = mkdtempSync(resolve(outputRoot, feature + '-'));
  const runtime = mkdtempSync(resolve(tmpdir(), 'task8-api-' + feature + '-'));
  const persist = resolve(runtime, 'storage');
  mkdirSync(persist, { mode: 0o700 });
  const backup = resolve(runtime, 'backup-empty');
  cpSync(persist, backup, { recursive: true, errorOnExist: true });
  report.preSchemaBackup = {
    path: backup,
    kind: 'empty isolated persist before first schema/data mutation',
  };
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const children = new Map();
  const save = (name, value) =>
    writeFileSync(resolve(out, name), JSON.stringify(value, null, 2) + '\n');
  report.feature = feature;
  report.startedAt = new Date().toISOString();
  report.run = { out, runtime, persist, port, node: process.version };

  function record(name, argv, cwd, startedAt, result, shutdown) {
    const row = {
      name,
      argv,
      cwd,
      startedAt,
      completedAt: new Date().toISOString(),
      exitCode: result.status,
      signal: result.signal,
      error: result.error?.message ?? null,
      ...(shutdown ? { shutdown } : {}),
    };
    for (const field of ['stdout', 'stderr']) {
      const bytes = result[field] ?? '';
      const path = name + '.' + field + '.log';
      writeFileSync(resolve(out, path), bytes);
      row[field] = { path, bytes: Buffer.byteLength(bytes), sha256: hash(bytes) };
    }
    report.commands.push(row);
    save('commands.json', report.commands);
  }

  function run(name, argv, cwd = api) {
    const startedAt = new Date().toISOString();
    const result = spawnSync(argv[0], argv.slice(1), {
      cwd,
      env: process.env,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    });
    record(name, argv, cwd, startedAt, result);
    assert.equal(result.error, undefined, name);
    assert.equal(result.status, 0, name + ': ' + result.stderr);
    return result.stdout;
  }

  async function stop(child) {
    if (!child) return;
    const state = children.get(child);
    if (!state) return;
    if (child.pid === undefined) {
      await state.completion;
      children.delete(child);
      return;
    }
    if (!state.closed) {
      state.shutdown = 'Owned process group SIGTERM';
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
      const timer = setTimeout(() => {
        state.shutdown = 'Owned process group SIGKILL after shutdown timeout';
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }, 5000);
      try {
        await state.completion;
      } finally {
        clearTimeout(timer);
      }
    }
    children.delete(child);
  }

  async function launch(
    name,
    argv,
    cwd = api,
    {
      timeoutMs = 30000,
      ready = (text) => text.includes('Ready on') || text.includes('Local:'),
    } = {},
  ) {
    const startedAt = new Date().toISOString();
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: process.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const state = { stdout: '', stderr: '', error: undefined, closed: false, shutdown: undefined };
    children.set(child, state);
    child.stdout.on('data', (bytes) => (state.stdout += bytes));
    child.stderr.on('data', (bytes) => (state.stderr += bytes));
    child.on('error', (error) => (state.error = error));
    state.completion = new Promise((accept) =>
      child.once('close', (status, signal) => {
        state.closed = true;
        record(name, argv, cwd, startedAt, { ...state, status, signal }, state.shutdown);
        accept();
      }),
    );
    try {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (state.error || state.closed)
          throw state.error ?? new Error('Process exited before readiness: ' + state.stderr);
        if (ready(state.stdout)) return child;
        await new Promise((accept) => setTimeout(accept, 50));
      }
      throw new Error('Startup timeout: ' + name + ': ' + state.stderr);
    } catch (error) {
      await stop(child);
      throw error;
    }
  }

  let worker;
  async function start(name, vars, production = false, secrets = {}) {
    await stopWorker();
    const config = JSON.parse(readFileSync(resolve(api, 'wrangler.jsonc')));
    config.main = resolve(
      api,
      production ? 'src/index.ts' : `tests/integration/${feature}.worker.ts`,
    );
    config.vars = { STUDIO_ENV: 'local', AUTH_MODE: 'local', ...vars };
    config.d1_databases = config.d1_databases.map((binding) => ({
      ...binding,
      migrations_dir: resolve(api, binding.migrations_dir),
    }));
    const file = resolve(runtime, name + '.json');
    writeFileSync(file, JSON.stringify(config));
    writeFileSync(resolve(runtime, '.dev.vars'), privateVarsText(secrets), { mode: 0o600 });
    worker = await launch(name, [
      'pnpm',
      'exec',
      'wrangler',
      'dev',
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--inspector-port',
      '0',
      '--config',
      file,
      '--persist-to',
      persist,
    ]);
  }
  async function stopWorker() {
    await stop(worker);
    worker = undefined;
  }
  async function cleanup() {
    for (const child of [...children.keys()]) await stop(child);
    report.completedAt = new Date().toISOString();
    save('report.json', report);
  }
  return {
    out,
    runtime,
    persist,
    baseUrl,
    port,
    save,
    run,
    start,
    stopWorker,
    launch,
    stop,
    cleanup,
  };
}
