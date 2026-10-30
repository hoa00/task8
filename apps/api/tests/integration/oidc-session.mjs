import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, cp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { seedRows } from '../../scripts/seed-data.mjs';
import { withReadKeys } from '../../scripts/read-keys.mjs';
import { newId } from '../../src/shared/ids.ts';
const root = fileURLToPath(new URL('../../../../', import.meta.url)),
  api = resolve(root, 'apps/api'),
  primary = resolve(root, '../work-management-suite'),
  identity = resolve(root, '../identity-service');
const run = promisify(execFile),
  require = createRequire(resolve(api, 'package.json')),
  wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { build } = await import(wranglerRequire.resolve('esbuild'));
const { Miniflare, convertV4MiniflareOptions } = await import(wranglerRequire.resolve('miniflare'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(process.version, 'v24.13.0', 'Task8 exact engine');
assert.equal((await run('pnpm', ['--version'], { cwd: root })).stdout.trim(), '11.19.0');
const evidence = resolve(
  process.env.TASK8_OIDC_EVIDENCE ??
    resolve(primary, 'docs/identity-foundation/evidence/WU-06/attempt-01/native-run-01.json'),
);
const dir = resolve(
  primary,
  '.artifacts/task8-identity-tests',
  new Date().toISOString().replaceAll(':', '-'),
);
const report = {
  startedAt: new Date().toISOString(),
  pid: process.pid,
  node: process.version,
  namespace: dir,
  layer:
    'Task8 native Workerd/D1 + real accepted Identity Workerd/D1; controlled D1 ages and HTTP faults distinguished',
  transport:
    'Async Fetcher.fetch test dispatcher; SDK and crypto in Workerd; Node TLS outbound transport uses actual OS DNS and existing CA',
  cases: [],
  commands: [],
  runtime: {
    task8: {
      miniflare: '5.20261006.0-alpha',
      workerd: '1.20261006.1',
      configuredDate: '2026-10-08',
    },
    identity: { miniflare: '4.20260730.0', workerd: '1.20260730.1', configuredDate: '2026-07-30' },
  },
};
const save = async () => {
  const temp = evidence + '.tmp';
  await writeFile(temp, JSON.stringify(report, null, 2) + '\n');
  await (await import('node:fs/promises')).rename(temp, evidence);
};
const selection = process.env.TASK8_OIDC_TEST_GROUP ?? 'all';
assert(['all', 'protocol'].includes(selection));
report.selection = selection;
const setupCases = new Set([
  'integer-sql-clock-preserves-exact-boundaries',
  'unknown-identity-no-auto-create',
  'cross-issuer-subject-does-not-match',
  'opaque-subject-preserves-local-user-member',
  'encrypted-digest-only-session-and-public-dto',
]);
const check = async (name, work) => {
  if (selection === 'protocol' && !setupCases.has(name) && !name.startsWith('protocol-')) {
    (report.notRunCases ??= []).push({
      name,
      status: 'NOT_RUN',
      reason:
        'explicit protocol-only selection; native20 carries unchanged production source cases',
    });
    return;
  }
  try {
    const details = await work();
    report.cases.push({ name, status: 'PASS', details });
  } catch (error) {
    report.cases.push({
      name,
      status: 'FAIL',
      error: {
        name: error.name,
        actual: typeof error.actual === 'number' ? error.actual : null,
        expected: typeof error.expected === 'number' ? error.expected : null,
        code: error.code ?? null,
        probeMethod: error.probeMethod ?? null,
        nativeName: error.nativeName ?? null,
        causeStatus: error.causeStatus ?? null,
        causePath: error.causePath ?? null,
        location: error.stack
          ?.split('\n')
          .filter((x) => x.includes('oidc-session.mjs:'))
          .slice(0, 3),
      },
    });
    throw new Error('CASE_FAILED:' + name, { cause: error });
  } finally {
    await save();
    console.log(name, report.cases.at(-1).status);
  }
};
const defaultRoots = [
  resolve(root, 'apps/api/.wrangler/state'),
  resolve(primary, '.wrangler/state'),
  resolve(primary, '.artifacts/demo/work-suite-data'),
  resolve(identity, 'apps/api/.wrangler/state'),
  resolve(identity, '.private/identity-local'),
];
async function snapshot() {
  return Promise.all(
    defaultRoots.map(async (path) => {
      const files = [];
      async function walk(base, relative = '') {
        let entries;
        try {
          entries = await readdir(base, { withFileTypes: true });
        } catch (error) {
          if (error.code === 'ENOENT') return;
          throw error;
        }
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
          const name = relative + entry.name;
          if (entry.isDirectory()) await walk(resolve(base, entry.name), name + '/');
          else if (entry.isFile())
            files.push([name, hash(await readFile(resolve(base, entry.name)))]);
        }
      }
      await walk(path);
      return { path, files: files.length, digest: hash(JSON.stringify(files)) };
    }),
  );
}
let task8,
  provider,
  owner,
  operator,
  db,
  options,
  barrierWait = null,
  fault = '',
  tokenCalls = 0,
  tokenTimes = [],
  cookie = '',
  providerBindings,
  client,
  account;
const driverKey = randomBytes(32).toString('base64url'),
  origin = 'https://datamaker-task.demo',
  issuer = 'https://identity-service.demo/api/auth';
const handled = (promise) => {
  void promise.catch(() => {});
  return promise;
};
const waitFor = async (promise) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(
        (_, reject) => (timer = setTimeout(() => reject(new Error('BARRIER_TIMEOUT')), 15000)),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
function barrier() {
  let ready, release;
  const reached = new Promise((r) => (ready = r)),
    pending = new Promise((r) => (release = r));
  return { reached, pending, ready, release };
}
async function budget(needed = 5) {
  if (!tokenTimes.length || tokenTimes.length + needed <= 17) return;
  while (Date.now() - tokenTimes.at(-1) < 61000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  report.rateLimitWaits = (report.rateLimitWaits ?? 0) + 1;
  tokenTimes = [];
}
async function outbound(request) {
  const path = new URL(request.url).pathname,
    isToken = path.endsWith('/oauth2/token');
  (report.networkRequests ??= []).push({ path, method: request.method });
  let stage = 'start';
  try {
    if (isToken) {
      tokenCalls++;
      tokenTimes.push(Date.now());
    }
    if (fault === 'outage' || (fault === 'before-503' && isToken))
      return new Response('{"error":"temporarily_unavailable"}', {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    stage = 'read-body';
    const requestBytes = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    stage = 'node-fetch';
    const response = await fetch(request.url, {
      method: request.method,
      headers: Object.fromEntries(
        [...request.headers].filter(
          ([name]) =>
            ![
              'content-length',
              'transfer-encoding',
              'connection',
              'keep-alive',
              'proxy-connection',
              'upgrade',
            ].includes(name.toLowerCase()),
        ),
      ),
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: requestBytes }),
    });
    if (isToken && barrierWait?.network) {
      const pending = barrierWait;
      pending.ready();
      await pending.pending;
    }
    if (
      isToken &&
      response.ok &&
      ['token-drop', 'token-malformed', 'token-untrusted', 'token-timeout'].includes(fault)
    ) {
      const mode = fault;
      await response.arrayBuffer();
      if (mode === 'token-drop')
        throw new Error('CONTROLLED_TRANSPORT_DROP_AFTER_NATIVE_CONSUMPTION');
      if (mode === 'token-timeout') await new Promise((resolve) => setTimeout(resolve, 6000));
      return new Response(
        mode === 'token-malformed'
          ? '{'
          : JSON.stringify({ token_type: 'Bearer', expires_in: 300 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (
      path.endsWith('/oauth2/introspect') &&
      response.ok &&
      ['introspection-wrong-sid', 'introspection-wrong-sub'].includes(fault)
    ) {
      const value = await response.json();
      if (fault === 'introspection-wrong-sid') value.sid = 'different-session-binding';
      else value.sub = 'different-opaque-subject';
      return new Response(JSON.stringify(value), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (isToken && response.ok && fault === 'lost-response') {
      await response.arrayBuffer();
      return new Response('{"error":"temporarily_unavailable"}', {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (path.endsWith('/oauth2/introspect') && fault === 'introspection-401') {
      await response.arrayBuffer();
      return new Response('{"error":"invalid_client"}', {
        status: 401,
        headers: {
          'content-type': 'application/json',
          'www-authenticate': 'Basic realm="fixture"',
        },
      });
    }
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    const bytes = await response.arrayBuffer();
    let errorCode = null;
    if (isToken && response.status !== 200) {
      try {
        const json = JSON.parse(new TextDecoder().decode(bytes));
        if (
          [
            'invalid_client',
            'invalid_grant',
            'invalid_request',
            'unsupported_grant_type',
            'invalid_scope',
            'temporarily_unavailable',
            'server_error',
            'rate_limit_exceeded',
          ].includes(json.error)
        )
          errorCode = json.error;
      } catch {
        // Untrusted response bodies contribute no diagnostic data.
      }
    }
    (report.networkResponses ??= []).push({
      path,
      method: request.method,
      status: response.status,
      bytes: bytes.byteLength,
      contentType: response.headers.get('content-type')?.split(';')[0] ?? null,
      errorCode,
    });
    return new Response(bytes, { status: response.status, headers });
  } catch (error) {
    (report.transportErrors ??= []).push({
      path,
      stage,
      name: error.name,
      code: error.code ?? null,
      causeCode: error.cause?.code ?? null,
      categories: {
        length: /length/iu.test(error.cause?.message ?? error.message ?? ''),
        headers: /header/iu.test(error.cause?.message ?? error.message ?? ''),
        fetchType: /fetch/iu.test(error.message ?? ''),
      },
    });
    throw error;
  }
}
const privateCall = async (worker, method, ...args) => {
  const target = await task8.getWorker(worker);
  const response = await target.fetch(
    new Request(origin + '/__private_probe', {
      method: 'POST',
      headers: { 'x-fixture-key': driverKey, 'content-type': 'application/json' },
      body: JSON.stringify({ method, args }),
    }),
  );
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error('PRIVATE_PROBE_FAILED');
    error.probeMethod = method;
    error.nativeName = result.name;
    error.code = result.code;
    error.causeStatus = result.causeStatus;
    error.causePath = result.causePath;
    throw error;
  }
  return result.result;
};
const probe = (method, ...args) => privateCall('task8-main', method, ...args),
  peer = (method, ...args) => privateCall('task8-peer', method, ...args);
const sql = (query, parameters = []) => probe('sql', query, parameters);
async function app(path, { sid, method = 'GET', body, headers = {} } = {}) {
  return (await task8.getWorker('task8-main')).fetch(
    new Request(origin + path, {
      method,
      headers: {
        origin,
        ...(sid ? { cookie: '__Host-task8_oidc_session=' + sid } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
async function grant() {
  await budget(2);
  const tx = await probe('begin');
  const response = await fetch(tx.url, { headers: { cookie }, redirect: 'manual' });
  const callback = response.headers.get('location') ?? (await response.json()).url;
  assert.ok(callback?.startsWith(origin + '/auth/callback?'));
  return { ...(await probe('grant', callback, tx.verifier, tx.state, tx.nonce)), nonce: tx.nonce };
}
async function freshSession() {
  await budget();
  const g = await grant(),
    result = await probe('create', g.tokens, g.nonce);
  assert.equal(result.status, 200);
  return result.result.sid;
}
async function row(sid) {
  return probe('inspect', sid);
}
async function stale(sid, age = 300001) {
  await sql('UPDATE oidcAppSessions SET authorityValidatedAt=? WHERE sidHash=?', [
    Date.now() - age,
    hash(sid),
  ]);
}
async function releaseLease(sid) {
  await sql('UPDATE oidcAppSessions SET leaseUntil=0 WHERE sidHash=?', [hash(sid)]);
}
async function boot() {
  task8 = new Miniflare(options());
  await task8.ready;
  db = await task8.getD1Database('DB', 'task8-main');
  const rows = (await run('ps', ['-ax', '-o', 'pid=,ppid=,comm='])).stdout
    .trim()
    .split('\n')
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return { pid: Number(parts[0]), ppid: Number(parts[1]), command: parts.slice(2).join(' ') };
    });
  const owned = new Set([process.pid]);
  for (let i = 0; i < 5; i++) for (const row of rows) if (owned.has(row.ppid)) owned.add(row.pid);
  (report.processManifest ??= []).push({
    at: new Date().toISOString(),
    ports: [4310, 4316],
    processes: rows.filter((row) => owned.has(row.pid)),
  });
  await save();
}
const heartbeat = setInterval(
  () =>
    console.log('native harness active', report.cases.length, 'cases', tokenCalls, 'token calls'),
  20000,
);
try {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await mkdir(dirname(evidence), { recursive: true });
  report.defaultBefore = await snapshot();
  const sourceNames = [
    ...(await run('git', ['diff', '--name-only'], { cwd: root })).stdout.trim().split('\n'),
    ...(await run('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root })).stdout
      .trim()
      .split('\n'),
  ]
    .filter(Boolean)
    .sort();
  report.source = [];
  for (const path of sourceNames) {
    const bytes = await readFile(resolve(root, path));
    report.source.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  await save();
  const { verifyIdentitySource } = await import(
    resolve(primary, 'tests/support/oidc-http-runtime.mjs')
  );
  Object.assign(report, await verifyIdentitySource(identity, process.env.IDENTITY_SOURCE_MANIFEST));
  const identityRequire = createRequire(resolve(identity, 'package.json')),
    {
      Miniflare: NativeProvider,
      Log,
      LogLevel,
    } = await import(identityRequire.resolve('miniflare'));
  const { environment } = await import(resolve(identity, 'apps/web/tests/environment.mjs'));
  for (const port of [4310, 4316]) {
    const listener = createServer();
    await new Promise((accept, reject) => {
      listener.once('error', reject);
      listener.listen(port, '127.0.0.1', accept);
    });
    await new Promise((r) => listener.close(r));
  }
  owner = await environment(resolve(dir, 'environment-backup'));
  report.environment = { before: owner.before };
  const { readJsoncConfig } = await import(resolve(primary, 'scripts/lib/jsonc-config.mjs'));
  const taskConfig = await readJsoncConfig(resolve(api, 'wrangler.jsonc')),
    providerConfig = await readJsoncConfig(resolve(identity, 'apps/api/wrangler.jsonc'));
  for (const [name, entry] of [
    ['provider', resolve(identity, 'apps/api/src/index.ts')],
    ['operator', resolve(identity, 'apps/api/src/operator.ts')],
    ['task8', resolve(api, 'tests/integration/oidc-session.worker.ts')],
  ]) {
    await build({
      entryPoints: [entry],
      outfile: resolve(dir, name + '.mjs'),
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      ...(name === 'task8'
        ? {
            banner: {
              js: "import {createRequire as createNativeRequire} from 'node:module'; const require=createNativeRequire('/task8.mjs');",
            },
          }
        : {}),
      external: ['node:*', 'cloudflare:workers'],
      loader: { '.sql': 'text' },
      logLevel: 'silent',
      plugins: [
        {
          name: 'native-compiled-wasm',
          setup(build) {
            build.onResolve({ filter: /\.wasm$/ }, () => ({
              path: './task8-icu.wasm',
              external: true,
            }));
          },
        },
      ],
    });
  }
  await cp(resolve(api, 'src/shared/collation/icu78-en-US.wasm'), resolve(dir, 'task8-icu.wasm'));
  await mkdir(resolve(dir, 'identity-d1'), { mode: 0o700 });
  await mkdir(resolve(dir, 'task8-d1'), { mode: 0o700 });
  await cp(dir, dir + '-before-schema', { recursive: true });
  report.backups = [
    { phase: 'before-any-schema-or-fixture-data', path: dir + '-before-schema', emptyD1: true },
  ];
  await save();
  providerBindings = {
    ...providerConfig.vars,
    IDENTITY_ENGINE_SECRET: randomBytes(48).toString('base64url'),
  };
  const ca = await readFile(process.env.NODE_EXTRA_CA_CERTS, 'utf8');
  provider = new NativeProvider({
    workers: ['provider', 'operator'].map((name) => ({
      name,
      modulesRoot: dir,
      compatibilityDate: providerConfig.compatibility_date,
      compatibilityFlags: providerConfig.compatibility_flags,
      modules: [{ type: 'ESModule', path: resolve(dir, name + '.mjs') }],
      d1Databases: { DB: 'wu06-idp' },
      bindings: providerBindings,
      outboundService: {
        network: {
          allow: ['public', 'private'],
          tlsOptions: { trustBrowserCas: true, trustedCertificates: [ca] },
        },
      },
      ...(name === 'provider'
        ? {
            assets: {
              directory: resolve(identity, 'apps/web/dist'),
              binding: 'ASSETS',
              routerConfig: { invoke_user_worker_ahead_of_assets: true, has_user_worker: true },
            },
          }
        : {}),
    })),
    d1Persist: resolve(dir, 'identity-d1'),
    host: '127.0.0.1',
    port: 4310,
    log: new Log(LogLevel.ERROR),
  });
  await provider.ready;
  await owner.add('identity-service', 4310);
  operator = await provider.getWorker('operator');
  await operator.migrate();
  const password = randomBytes(24).toString('base64url'),
    operatorPassword = randomBytes(24).toString('base64url'),
    email = 'task8-native@identity.invalid',
    operatorEmail = 'task8-operator@identity.invalid';
  account = await operator.bootstrap({
    email,
    name: 'Native Task8 Fixture',
    password,
    role: 'user',
  });
  await operator.bootstrap({
    email: operatorEmail,
    name: 'Native Operator',
    password: operatorPassword,
    role: 'admin',
  });
  client = await operator.registerClient({ index: 1, operatorEmail, operatorPassword });
  await writeFile(
    resolve(dir, 'private-config.json'),
    JSON.stringify({ email, password, operatorEmail, operatorPassword, client, providerBindings }),
    { mode: 0o600 },
  );
  const signin = await fetch(issuer + '/sign-in/email', {
    method: 'POST',
    headers: { origin: new URL(issuer).origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signin.status, 200);
  cookie = signin.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const bindings = {
    AUTH_MODE: 'oidc',
    STUDIO_ENV: 'local',
    AUTH_APP_ORIGIN: origin,
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: client.client_id,
    OIDC_CLIENT_SECRET: client.client_secret,
    RP_ENVIRONMENT: 'wu06-isolated',
    RP_TOKEN_ENCRYPTION_KEYSET: JSON.stringify({
      active: 'initial',
      keys: { initial: randomBytes(32).toString('base64url') },
    }),
    DRIVER_KEY: driverKey,
  };
  const workers = ['task8-main', 'task8-peer'].map((name) => ({
    name,
    modulesRoot: dir,
    routes: [origin + '/*'],
    compatibilityDate: taskConfig.compatibility_date,
    compatibilityFlags: taskConfig.compatibility_flags,
    modules: [
      { type: 'ESModule', path: resolve(dir, 'task8.mjs') },
      { type: 'CompiledWasm', path: resolve(dir, 'task8-icu.wasm') },
    ],
    bindings,
    d1Databases: { DB: taskConfig.d1_databases[0].database_id },
    r2Buckets: { FILES: 'wu06-files' },
    serviceBindings: {
      BARRIER: async () => {
        if (barrierWait && !barrierWait.network) {
          const wait = barrierWait;
          wait.ready();
          await wait.pending;
        }
        return new Response(null, { status: 204 });
      },
    },
    outboundService: outbound,
  }));
  options = () => ({
    ...convertV4MiniflareOptions({ workers, host: '127.0.0.1', port: 4316, cf: false }),
    resourcePersistencePath: resolve(dir, 'task8-d1'),
  });
  await boot();
  const migrations = (await readdir(resolve(api, 'src/db/migrations')))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  // Native execution of committed generated SQL in an isolated namespace. Wrangler ledger rehearsal is separate.
  for (const name of migrations)
    await db.batch(
      (await readFile(resolve(api, 'src/db/migrations', name), 'utf8'))
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
  const seed = seedRows();
  for (const [table, primaryRows] of Object.entries(seed.rows)) {
    const rows = [...primaryRows, ...(seed.secondary[table] ?? [])];
    for (let offset = 0; offset < rows.length; offset += 30)
      await db.batch(
        rows.slice(offset, offset + 30).map((source) => {
          const row = withReadKeys(table, source),
            fields = Object.keys(row);
          return db
            .prepare(
              'INSERT INTO ' +
                table +
                '(' +
                fields.join(',') +
                ') VALUES(' +
                fields.map(() => '?').join(',') +
                ')',
            )
            .bind(...Object.values(row));
        }),
      );
  }
  const fixture = seedRows(),
    localUserId = fixture.primary.userId,
    workspaceId = fixture.primary.workspaceId;
  report.fixture = {
    localUserId,
    workspaceId,
    subjectOpaque: !/^[0-9a-f-]{36}$/iu.test(account.userId),
    businessTablesSeeded: Object.keys(fixture.rows).length,
  };
  report.sqlClockSamples = [];
  for (let i = 0; i < 25; i++) {
    const [sample] = await sql(
      "SELECT CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) floatingClock, CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER) exactClock",
    );
    report.sqlClockSamples.push(sample);
  }
  const protectedTables = (
    await sql(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'oidc%' ORDER BY name",
    )
  ).map((row) => row.name);
  for (const table of protectedTables) assert.match(table, /^[A-Za-z0-9_]+$/u);
  const businessSnapshot = async () => {
    const result = {};
    for (const table of protectedTables) {
      const rows = await sql('SELECT * FROM ' + table);
      result[table] = {
        count: rows.length,
        digest: hash(JSON.stringify(rows.map((row) => JSON.stringify(row)).sort())),
      };
    }
    return result;
  };
  report.businessBefore = await businessSnapshot();
  await check('integer-sql-clock-preserves-exact-boundaries', async () => {
    assert(report.sqlClockSamples.some((sample) => sample.exactClock - sample.floatingClock === 1));
    for (let i = 0; i < 12; i++) {
      const [sample] = await sql(
        "WITH moment AS(SELECT CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER) t) SELECT t<=t createdAtAccepted,t<t absoluteExpired,t-t<300000 freshNow,t-(t-300000)<300000 freshnessExpired FROM moment",
      );
      assert.deepEqual(sample, {
        createdAtAccepted: 1,
        absoluteExpired: 0,
        freshNow: 1,
        freshnessExpired: 0,
      });
    }
    return {
      floatingClockLostMillisecondObserved: true,
      exactCreatedAccepted: true,
      absoluteExpiredAtEquality: true,
      staleAt300000: true,
    };
  });
  await check('unknown-identity-no-auto-create', async () => {
    const g = await grant();
    assert.equal((await probe('create', g.tokens, g.nonce)).status, 403);
    assert.equal((await sql('SELECT count(*) n FROM oidcAppSessions'))[0].n, 0);
    return { expected: 403, actual: 403 };
  });
  await check('cross-issuer-subject-does-not-match', async () => {
    const g = await grant();
    await sql(
      'INSERT INTO oidcIdentityLinks(id,issuer,subject,userId,createdAt,createdBy,migrationBatchId) VALUES(?,?,?,?,?,?,?)',
      [
        '01a11abd-aa80-7000-8000-000000000096',
        issuer + '/',
        account.userId,
        localUserId,
        Date.now(),
        'owned-cross-issuer-fixture',
        'wu06-native',
      ],
    );
    assert.equal((await probe('create', g.tokens, g.nonce)).status, 403);
    return { status: 403, wrongNamespaceOnly: true };
  });
  await sql(
    'INSERT INTO oidcIdentityLinks(id,issuer,subject,userId,createdAt,createdBy,migrationBatchId) VALUES(?,?,?,?,?,?,?)',
    [
      fixture.rows.users[1].id,
      issuer,
      account.userId,
      localUserId,
      Date.now(),
      'owned-native-fixture',
      'wu06-native',
    ],
  );
  let session;
  await check('opaque-subject-preserves-local-user-member', async () => {
    session = await freshSession();
    const resolved = await probe('authenticate', session, {});
    assert.equal(resolved.status, 200);
    assert.equal(resolved.userId, localUserId);
    assert.equal(resolved.currentWorkspaceId, workspaceId);
    assert.equal(resolved.mechanism, 'oidc');
    return { expectedUserId: localUserId, actualUserId: resolved.userId };
  });
  await check('encrypted-digest-only-session-and-public-dto', async () => {
    const saved = await row(session);
    assert.equal(saved.sidHash, hash(session));
    assert.equal(saved.expiresAt - saved.createdAt, 28800000);
    assert.equal(JSON.parse(saved.bundle).version, 1);
    assert(!saved.bundle.includes(session));
    const response = await app('/api/v1/session', { sid: session });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.data.capabilities.identityMode, 'oidc');
    assert(!Object.hasOwn(data.data, 'authentication'));
    for (const forbidden of [
      'issuer',
      'subject',
      'providerSid',
      'bundle',
      'sidHash',
      'refresh_token',
      'access_token',
    ])
      assert(!JSON.stringify(data).includes('"' + forbidden + '":'));
    return { status: response.status, absoluteMilliseconds: 28800000 };
  });
  await check('protocol-initial-native-nonce-and-signature-rejection', async () => {
    const g = await grant();
    assert.equal((await probe('create', g.tokens, g.nonce + 'wrong')).status, 401);
    const parts = g.tokens.id_token.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    assert.equal(
      (await probe('create', { ...g.tokens, id_token: parts.join('.') }, g.nonce)).status,
      401,
    );
    return {
      nativeSignedWrongExpectedNonce: 401,
      alteredNativeSignature: 401,
      note: 'signature mutation proves rejection, not independent issuer/audience validator isolation',
    };
  });
  for (const kind of ['sid', 'sub'])
    await check('protocol-immutable-original-' + kind + '-mismatch', async () => {
      await budget(3);
      const sid = await freshSession();
      await stale(sid);
      fault = 'introspection-wrong-' + kind;
      try {
        assert.equal((await probe('authenticate', sid, {})).status, 401);
      } finally {
        fault = '';
      }
      assert((await row(sid)).revokedAt !== null);
      return {
        status: 401,
        clock: 'F introspection response field fault AFTER real native provider response',
        originalBindingNeverAdopted: true,
      };
    });
  for (const kind of ['token-drop', 'token-malformed', 'token-untrusted', 'token-timeout'])
    await check('protocol-unknown-' + kind + '-retains-input-clock', async () => {
      await budget(3);
      const sid = await freshSession();
      await stale(sid);
      const before = await row(sid),
        started = Date.now();
      fault = kind;
      try {
        assert.equal((await probe('authenticate', sid, {})).status, 503);
      } finally {
        fault = '';
      }
      const marked = await row(sid);
      assert.equal(marked.refreshInput, before.bundle);
      assert(marked.refreshAttemptAt > 0);
      assert.equal(marked.authorityValidatedAt, before.authorityValidatedAt);
      if (kind === 'token-timeout') {
        assert(Date.now() - started >= 4900);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      assert.equal((await probe('authenticate', sid, {})).status, 200);
      return {
        status: 503,
        recovery: 200,
        originalInputPreserved: true,
        originalAttemptAt: marked.refreshAttemptAt,
        wallClockMilliseconds: Date.now() - started,
        layer:
          'F controlled transport fault AFTER actual native token consumption; SDK/D1 inside real Workerd',
      };
    });
  await check('freshness299-and-stale-outage300', async () => {
    await stale(session, 299000);
    fault = 'outage';
    assert.equal((await probe('authenticate', session, {})).status, 200);
    await stale(session);
    const stamp = (await row(session)).authorityValidatedAt;
    assert.equal((await probe('authenticate', session, {})).status, 503);
    assert.equal((await row(session)).authorityValidatedAt, stamp);
    fault = '';
    await releaseLease(session);
    return {
      clock: 'F controlled D1 validation ages, W real native transport fault',
      fresh: 200,
      stale: 503,
    };
  });
  await check('native-refresh-recovery-after-outage', async () => {
    await budget();
    assert.equal((await probe('authenticate', session, {})).status, 200);
    const saved = await row(session);
    assert.equal(saved.refreshInput, null);
    assert.equal(saved.expiresAt - saved.createdAt, 28800000);
    return { status: 200 };
  });
  await check('restart-retains-encrypted-session', async () => {
    await task8.dispose();
    await boot();
    assert.equal((await probe('authenticate', session, {})).status, 200);
    return { status: 200 };
  });
  await check('wrong-cookie-namespace-no-auth-fallback', async () => {
    for (const name of ['__Host-task8_session', '__Host-suite_session'])
      assert.equal(
        (await app('/api/v1/session', { headers: { cookie: name + '=' + session } })).status,
        401,
      );
    assert.equal(
      (await app('/api/v1/session', { headers: { authorization: 'Bearer ' + session } })).status,
      401,
    );
    assert.equal(
      (await app('/api/v1/auth/login', { method: 'POST', body: { email, password } })).status,
      501,
    );
    return { wrongNamespace: 401, legacyLoginInOidc: 501 };
  });
  await check('current-membership-revoke-after-identity', async () => {
    const member = (
      await sql('SELECT id,status FROM workspaceMembers WHERE workspaceId=? AND userId=?', [
        workspaceId,
        localUserId,
      ])
    )[0];
    await sql("UPDATE workspaceMembers SET status='invited' WHERE id=?", [member.id]);
    assert.equal(
      (await app('/api/v1/workspaces/' + workspaceId + '/members', { sid: session })).status,
      404,
    );
    await sql("UPDATE workspaceMembers SET status='active' WHERE id=?", [member.id]);
    return { expected: 404, actual: 404, privacyPolicy: 'existing workspace not-found' };
  });

  await check('native-wrong-basic-is-non-consuming', async () => {
    await budget();
    const sid = await freshSession();
    await stale(sid);
    const before = await row(sid),
      wrong = randomBytes(32).toString('base64url');
    assert.equal((await probe('authenticate', sid, { secret: wrong })).status, 503);
    const rejected = await row(sid);
    assert.equal(rejected.refreshInput, null);
    assert.equal(rejected.refreshAttemptAt, 0);
    assert.equal(rejected.leaseOwner, null);
    assert.equal(rejected.authorityValidatedAt, before.authorityValidatedAt);
    assert.equal((await probe('authenticate', sid, {})).status, 200);
    return { knownRejected: 503, recovered: 200, markCleared: true };
  });
  await check('lost-response-native-generation-recovery', async () => {
    await budget();
    const sid = await freshSession();
    await stale(sid);
    fault = 'lost-response';
    assert.equal((await probe('authenticate', sid, {})).status, 503);
    const uncertain = await row(sid);
    assert.equal(uncertain.refreshInput, uncertain.bundle);
    assert(uncertain.refreshAttemptAt > 0);
    fault = '';
    assert.equal((await peer('authenticate', sid, {})).status, 200);
    const saved = await row(sid);
    assert.equal(saved.refreshInput, null);
    assert.equal(saved.revision, uncertain.revision + 1);
    assert.equal(saved.createdAt, uncertain.createdAt);
    assert.equal(saved.expiresAt, uncertain.expiresAt);
    return { unknown: 503, recovered: 200, sameAbsoluteExpiry: true };
  });
  await check('unknown-then-invalid-client-keeps-original-input-and-clock', async () => {
    await budget();
    const sid = await freshSession();
    await stale(sid);
    fault = 'before-503';
    assert.equal((await probe('authenticate', sid, {})).status, 503);
    fault = '';
    const original = await row(sid);
    assert.equal(
      (await peer('authenticate', sid, { secret: randomBytes(32).toString('base64url') })).status,
      503,
    );
    const rejected = await row(sid);
    assert.equal(rejected.refreshInput, original.refreshInput);
    assert.equal(rejected.refreshAttemptAt, original.refreshAttemptAt);
    assert.equal(rejected.revokedAt, null);
    assert.equal((await probe('authenticate', sid, {})).status, 200);
    return { unknown: 503, knownReject: 503, recovery: 200, originalMarkPreserved: true };
  });
  await check('token-success-introspection-failure-keeps-consumed-mark', async () => {
    await budget();
    const sid = await freshSession();
    await stale(sid);
    fault = 'introspection-401';
    assert.equal((await probe('authenticate', sid, {})).status, 503);
    fault = '';
    const consumed = await row(sid);
    assert(consumed.refreshInput);
    assert.equal(consumed.revokedAt, null);
    await releaseLease(sid);
    assert.equal((await probe('authenticate', sid, {})).status, 200);
    assert.equal((await row(sid)).createdAt, consumed.createdAt);
    return { status: 503, recovery: 200, consumedMarkRetained: true };
  });
  await check('concurrent-isolates-only-one-refresh-owner', async () => {
    await budget();
    const sid = await freshSession();
    await stale(sid);
    const wait = barrier();
    wait.network = true;
    barrierWait = wait;
    const winner = handled(probe('authenticate', sid, {}));
    await waitFor(wait.reached);
    const requests = tokenCalls;
    assert.equal((await peer('authenticate', sid, {})).status, 503);
    assert.equal(tokenCalls, requests);
    wait.release();
    barrierWait = null;
    assert.equal((await winner).status, 200);
    return { winner: 200, loser: 503, additionalLoserTokenCalls: 0 };
  });
  await check('logout-during-refresh-cas-zero-cannot-resurrect', async () => {
    await budget();
    const sid = await freshSession();
    await stale(sid);
    const wait = barrier();
    wait.network = true;
    barrierWait = wait;
    const pending = handled(probe('authenticate', sid, {}));
    await waitFor(wait.reached);
    assert.equal(await peer('revoke', sid), true);
    wait.release();
    barrierWait = null;
    assert.equal((await pending).status, 401);
    const saved = await row(sid);
    assert(saved.revokedAt);
    assert.equal(saved.bundle, '');
    assert.equal(saved.refreshInput, null);
    return { lateRefresh: 401, revoked: true };
  });
  await check('pre-send-mark-cas-zero-no-token-call', async () => {
    await budget();
    const sid = await freshSession();
    await stale(sid);
    const wait = barrier();
    barrierWait = wait;
    const pending = handled(probe('authenticate', sid, { phase: 'claim' }));
    await waitFor(wait.reached);
    const calls = tokenCalls;
    await peer('revoke', sid);
    wait.release();
    barrierWait = null;
    assert.equal((await pending).status, 401);
    assert.equal(tokenCalls, calls);
    return { status: 401, tokenCalls: 0 };
  });
  await check('stale-select-lease-handoff-uses-current-row-input', async () => {
    await budget();
    const sid = await freshSession();
    await stale(sid);
    const wait = barrier();
    barrierWait = wait;
    const pending = handled(probe('authenticate', sid, { phase: 'read' }));
    await waitFor(wait.reached);
    fault = 'before-503';
    assert.equal((await peer('authenticate', sid, {})).status, 503);
    fault = '';
    const original = await row(sid);
    assert(original.refreshInput);
    wait.release();
    barrierWait = null;
    assert.equal((await pending).status, 200);
    assert.equal((await row(sid)).refreshInput, null);
    return { inheritedUnknown: 503, recovered: 200, atomicCurrentInput: true };
  });
  await check('local-membership-revoked-while-awaiting-upstream', async () => {
    await budget();
    const sid = await freshSession();
    await stale(sid);
    const member = (
      await sql('SELECT id FROM workspaceMembers WHERE userId=? AND workspaceId=?', [
        localUserId,
        workspaceId,
      ])
    )[0];
    const wait = barrier();
    wait.network = true;
    barrierWait = wait;
    const response = handled(app('/api/v1/workspaces/' + workspaceId + '/members', { sid }));
    await waitFor(wait.reached);
    await sql("UPDATE workspaceMembers SET status='invited' WHERE id=?", [member.id]);
    wait.release();
    barrierWait = null;
    assert.equal((await response).status, 404);
    await sql("UPDATE workspaceMembers SET status='active' WHERE id=?", [member.id]);
    return { requestAfterNetwork: 404 };
  });
  await check('current-project-authorization-owner-has-no-private-bypass', async () => {
    const sid = await freshSession(),
      memberId = fixture.primary.memberId,
      privateProject = fixture.rows.projects.find((project) => project.visibility === 'private'),
      privateTask = fixture.rows.tasks.find(
        (task) => task.projectId === privateProject.id && !task.deletedAt && !task.archivedAt,
      );
    const grants = await sql(
      'SELECT * FROM projectMembers WHERE workspaceId=? AND projectId=? AND memberId=?',
      [workspaceId, privateProject.id, memberId],
    );
    await sql('DELETE FROM projectMembers WHERE workspaceId=? AND projectId=? AND memberId=?', [
      workspaceId,
      privateProject.id,
      memberId,
    ]);
    assert.equal(
      (await app('/api/v1/workspaces/' + workspaceId + '/tasks/' + privateTask.id, { sid })).status,
      404,
    );
    for (const grant of grants)
      await sql(
        'INSERT INTO projectMembers(workspaceId,projectId,memberId,permission) VALUES(?,?,?,?)',
        [grant.workspaceId, grant.projectId, grant.memberId, grant.permission],
      );
    return { privateTaskWithoutGrant: 404, existingRolePreserved: true };
  });
  await check('membership-revoke-during-upstream-denies-business-mutation', async () => {
    await budget();
    const sid = await freshSession(),
      saved = await row(sid),
      before = (await sql('SELECT * FROM users WHERE id=?', [localUserId]))[0];
    await stale(sid);
    const wait = barrier();
    wait.network = true;
    barrierWait = wait;
    const pending = handled(
      app('/api/v1/me/profile', {
        sid,
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'X-Task8-Session-Id': saved.id },
        body: { title: 'Rejected pending authority', expectedVersion: before.version },
      }),
    );
    await waitFor(wait.reached);
    await sql("UPDATE workspaceMembers SET status='invited' WHERE userId=?", [localUserId]);
    wait.release();
    barrierWait = null;
    assert.equal((await pending).status, 403);
    assert.deepEqual((await sql('SELECT * FROM users WHERE id=?', [localUserId]))[0], before);
    await sql("UPDATE workspaceMembers SET status='active' WHERE userId=?", [localUserId]);
    return { mutation: 403, profileEffects: 0 };
  });
  await check('absolute-eight-hours-no-outbound-even-after-recent-validation', async () => {
    const sid = await freshSession(),
      saved = await row(sid),
      calls = tokenCalls;
    const clock = Date.now();
    await sql(
      'UPDATE oidcAppSessions SET createdAt=?,expiresAt=?,authorityValidatedAt=? WHERE id=?',
      [clock - 28800000, clock, clock, saved.id],
    );
    assert.equal((await probe('authenticate', sid, {})).status, 401);
    assert.equal(tokenCalls, calls);
    return { clock: 'F controlled D1 exact8h boundary', status: 401, outboundTokenCalls: 0 };
  });
  await check('ciphertext-tamper-and-keyring-overlap-after-restart', async () => {
    const sid = await freshSession(),
      saved = await row(sid),
      original = bindings.RP_TOKEN_ENCRYPTION_KEYSET,
      keyset = JSON.parse(original);
    keyset.keys.next = randomBytes(32).toString('base64url');
    keyset.active = 'next';
    bindings.RP_TOKEN_ENCRYPTION_KEYSET = JSON.stringify(keyset);
    await task8.dispose();
    await boot();
    assert.equal((await probe('authenticate', sid, {})).status, 200);
    await stale(sid);
    assert.equal((await probe('authenticate', sid, {})).status, 200);
    assert.equal(JSON.parse((await row(sid)).bundle).keyId, 'next');
    delete keyset.keys.initial;
    bindings.RP_TOKEN_ENCRYPTION_KEYSET = JSON.stringify(keyset);
    await task8.dispose();
    await boot();
    const rowBefore = await row(sid);
    await sql('UPDATE oidcAppSessions SET bundle=? WHERE id=?', [saved.bundle, rowBefore.id]);
    assert.equal((await probe('authenticate', sid, {})).status, 503);
    await sql('UPDATE oidcAppSessions SET bundle=? WHERE id=?', [
      rowBefore.bundle.slice(0, -5) + 'AAAAA',
      rowBefore.id,
    ]);
    assert.equal((await probe('authenticate', sid, {})).status, 503);
    return { overlap: 200, retiredOldCiphertext: 503, tampered: 503 };
  });
  await check('native-invalid-grant-is-terminal', async () => {
    await budget();
    const sid = await freshSession();
    assert.equal((await probe('revokeGrant', sid)).status, 200);
    await stale(sid);
    assert.equal((await probe('authenticate', sid, {})).status, 401);
    return { nativeRevoke: 200, stale: 401 };
  });
  await check('unknown-outside-original-thirty-seconds-no-network', async () => {
    await budget();
    const sid = await freshSession();
    await stale(sid);
    fault = 'before-503';
    assert.equal((await probe('authenticate', sid, {})).status, 503);
    fault = '';
    const original = await row(sid),
      started = Date.now();
    while (Date.now() - started < 31000) await new Promise((resolve) => setTimeout(resolve, 1000));
    const calls = tokenCalls;
    assert.equal((await probe('authenticate', sid, {})).status, 401);
    assert.equal(tokenCalls, calls);
    return {
      wallClockWaitMilliseconds: Date.now() - started,
      originalAttemptAt: original.refreshAttemptAt,
      status: 401,
      outboundTokenCalls: 0,
    };
  });
  await check('normal-oidc-idempotent-command-wins-with-current-authority', async () => {
    const sid = await freshSession(),
      saved = await row(sid),
      notification = (
        await sql(
          'SELECT id FROM notifications WHERE workspaceId=? AND recipientId=? AND readAt IS NOT NULL LIMIT 1',
          [workspaceId, fixture.primary.memberId],
        )
      )[0];
    assert(notification);
    const before = await businessSnapshot(),
      response = await app(
        '/api/v1/workspaces/' + workspaceId + '/notifications/' + notification.id,
        {
          sid,
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'X-Task8-Session-Id': saved.id },
          body: { read: true },
        },
      );
    assert.equal(response.status, 200);
    assert.deepEqual(await businessSnapshot(), before);
    return { status: 200, businessDataUnchangedByIdempotentCommand: true };
  });
  for (const kind of ['session-revoke', 'absolute-expiry', 'freshness-stale'])
    await check('business-commit-current-authority-' + kind, async () => {
      const sid = await freshSession(),
        saved = await row(sid),
        task = (
          await sql(
            "SELECT t.* FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.deletedAt IS NULL AND t.archivedAt IS NULL AND p.visibility='workspace' AND p.archivedAt IS NULL AND p.deletedAt IS NULL ORDER BY t.id LIMIT 1",
            [workspaceId],
          )
        )[0];
      assert(task);
      const before = await businessSnapshot(),
        wait = barrier();
      barrierWait = wait;
      const pending = handled(
        app('/api/v1/workspaces/' + workspaceId + '/tasks/' + task.id, {
          sid,
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'X-Task8-Session-Id': saved.id,
            'x-fixture-commit': driverKey,
          },
          body: { title: 'Must not commit', expectedVersion: task.version },
        }),
      );
      await waitFor(wait.reached);
      const calls = tokenCalls;
      if (kind === 'session-revoke') await probe('revoke', sid);
      else if (kind === 'absolute-expiry') {
        const now = Date.now();
        await sql('UPDATE oidcAppSessions SET createdAt=?,expiresAt=? WHERE id=?', [
          now - 28800000,
          now,
          saved.id,
        ]);
      } else
        await sql('UPDATE oidcAppSessions SET authorityValidatedAt=? WHERE id=?', [
          Date.now() - 300001,
          saved.id,
        ]);
      wait.release();
      barrierWait = null;
      const response = await pending,
        expected = kind === 'freshness-stale' ? 503 : 401;
      assert.equal(response.status, expected);
      assert.equal(tokenCalls, calls);
      assert.deepEqual(await businessSnapshot(), before);
      return {
        status: response.status,
        barrier: 'AFTER principal and local precheck, BEFORE actual winning native batch',
        businessEffects: 0,
        additionalTokenCalls: 0,
        clock:
          kind === 'session-revoke'
            ? 'W native revoke'
            : 'F controlled D1 time boundary with W native batch',
      };
    });
  await check('profile-custom-root-revoked-before-native-commit', async () => {
    const sid = await freshSession(),
      saved = await row(sid),
      user = (await sql('SELECT * FROM users WHERE id=?', [localUserId]))[0],
      before = await businessSnapshot(),
      wait = barrier();
    barrierWait = wait;
    const pending = handled(
      app('/api/v1/me/profile', {
        sid,
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'X-Task8-Session-Id': saved.id,
          'x-fixture-commit': driverKey,
        },
        body: { name: 'Must not commit profile', expectedVersion: user.version },
      }),
    );
    await waitFor(wait.reached);
    await probe('revoke', sid);
    wait.release();
    barrierWait = null;
    assert.equal((await pending).status, 401);
    assert.deepEqual(await businessSnapshot(), before);
    return {
      status: 401,
      customRoot: 'users update and dependent membership marker',
      businessEffects: 0,
    };
  });
  await check('business-commit-revoked-link-and-identity-admin-no-local-owner', async () => {
    await budget();
    const target = fixture.rows.workspaceMembers.find(
      (member) =>
        member.workspaceId === workspaceId &&
        member.userId !== localUserId &&
        member.status === 'active' &&
        member.role === 'Member',
    );
    assert(target);
    const fixturePassword = randomBytes(24).toString('base64url'),
      fixtureEmail = 'commit-link-admin@identity.invalid',
      upstream = await operator.bootstrap({
        email: fixtureEmail,
        name: 'Commit authority fixture',
        password: fixturePassword,
        role: 'admin',
      });
    const signIn = await fetch(issuer + '/sign-in/email', {
      method: 'POST',
      headers: { origin: new URL(issuer).origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: fixtureEmail, password: fixturePassword }),
    });
    assert.equal(signIn.status, 200);
    await sql(
      'INSERT INTO oidcIdentityLinks(id,issuer,subject,userId,createdAt,createdBy,migrationBatchId) VALUES(?,?,?,?,?,?,?)',
      [
        newId(),
        issuer,
        upstream.userId,
        target.userId,
        Date.now(),
        'owned-commit-fixture',
        'wu06-native',
      ],
    );
    const previousCookie = cookie;
    let sid;
    try {
      cookie = signIn.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      sid = await freshSession();
    } finally {
      cookie = previousCookie;
    }
    const saved = await row(sid),
      task = (
        await sql(
          "SELECT t.* FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.deletedAt IS NULL AND t.archivedAt IS NULL AND p.visibility='workspace' AND p.archivedAt IS NULL AND p.deletedAt IS NULL ORDER BY t.id LIMIT 1",
          [workspaceId],
        )
      )[0];
    assert.equal(
      (await sql('SELECT role FROM workspaceMembers WHERE id=?', [target.id]))[0].role,
      'Member',
    );
    const before = await businessSnapshot(),
      wait = barrier();
    barrierWait = wait;
    const pending = handled(
      app('/api/v1/workspaces/' + workspaceId + '/tasks/' + task.id, {
        sid,
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'X-Task8-Session-Id': saved.id,
          'x-fixture-commit': driverKey,
        },
        body: { title: 'Must not commit revoked link', expectedVersion: task.version },
      }),
    );
    await waitFor(wait.reached);
    await sql(
      "UPDATE oidcIdentityLinks SET status='revoked',revision=revision+1 WHERE issuer=? AND subject=?",
      [issuer, upstream.userId],
    );
    wait.release();
    barrierWait = null;
    assert.equal((await pending).status, 401);
    assert.deepEqual(await businessSnapshot(), before);
    return {
      status: 401,
      businessEffects: 0,
      identityRole: 'admin',
      localRole: 'Member',
      autoOwner: false,
    };
  });
  await check('ended-native-session-offline-refresh-never-restores-browser-authority', async () => {
    await budget();
    const sid = await freshSession();
    const logout = await fetch(issuer + '/sign-out', {
      method: 'POST',
      headers: { origin: new URL(issuer).origin, cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(logout.status, 200);
    assert.equal((await probe('authenticate', sid, {})).status, 200);
    await stale(sid);
    const raw = await probe('offline', sid);
    assert.equal(raw.refreshStatus, 200);
    assert.equal(raw.active, true);
    assert.equal(raw.sidPresent, false);
    assert.equal((await probe('authenticate', sid, {})).status, 401);
    return { nativeSignOut: 200, rawOffline: raw, adapter: 401 };
  });
  await check('supported-banUser-offline-refresh-denied', async () => {
    await budget();
    const signIn = await fetch(issuer + '/sign-in/email', {
      method: 'POST',
      headers: { origin: new URL(issuer).origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(signIn.status, 200);
    cookie = signIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const sid = await freshSession();
    await operator.ban({ operatorEmail, operatorPassword, userId: account.userId });
    await stale(sid);
    const raw = await probe('offline', sid);
    assert.equal(raw.refreshStatus, 200);
    assert.equal(raw.sidPresent, false);
    assert.equal((await probe('authenticate', sid, {})).status, 401);
    return { supportedBan: true, rawOffline: raw, adapter: 401 };
  });
  await check('explicit-link-uniqueness-revocation-no-reassignment', async () => {
    await assert.rejects(
      sql(
        'INSERT INTO oidcIdentityLinks(id,issuer,subject,userId,createdAt,createdBy,migrationBatchId) VALUES(?,?,?,?,?,?,?)',
        [
          fixture.rows.users[2].id,
          issuer,
          account.userId,
          fixture.rows.users[1].id,
          Date.now(),
          'fixture',
          'fixture',
        ],
      ),
    );
    await sql(
      "UPDATE oidcIdentityLinks SET status='revoked',revision=revision+1 WHERE issuer=? AND subject=?",
      [issuer, account.userId],
    );
    assert.equal((await probe('authenticate', session, {})).status, 401);
    return { duplicateRejected: true, revoked: 401 };
  });
  report.businessAfter = await businessSnapshot();
  assert.deepEqual(report.businessAfter, report.businessBefore);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.failure = {
    name: error.name,
    code: error.code ?? null,
    categories: {
      sql: /SQL|sqlite|D1/iu.test(error.message ?? ''),
      length: /too (?:big|long|large)|length/iu.test(error.message ?? ''),
      constraint: /constraint/iu.test(error.message ?? ''),
      syntax: /syntax/iu.test(error.message ?? ''),
    },
    location: error.stack
      ?.split('\n')
      .filter((line) => line.includes('oidc-session.mjs:'))
      .slice(0, 4),
  };
  process.exitCode = 1;
  console.log('native harness failed', report.failure.name, report.failure.code ?? '');
} finally {
  clearInterval(heartbeat);
  barrierWait?.release();
  for (const [name, runtime] of [
    ['task8', task8],
    ['identity', provider],
  ])
    if (runtime)
      try {
        await runtime.dispose();
      } catch (error) {
        (report.cleanupErrors ??= []).push({
          runtime: name,
          name: error.name,
          code: error.code ?? null,
        });
      }
  if (owner)
    try {
      report.environment.after = await owner.close();
    } catch (error) {
      (report.cleanupErrors ??= []).push({
        runtime: 'aliases',
        name: error.name,
        code: error.code ?? null,
      });
    }
  report.defaultAfter = await snapshot();
  report.defaultUnchanged =
    JSON.stringify(report.defaultBefore) === JSON.stringify(report.defaultAfter);
  report.completedAt = new Date().toISOString();
  await save();
  console.log(
    JSON.stringify({
      status: report.status,
      cases: report.cases.length,
      evidence,
      defaultUnchanged: report.defaultUnchanged,
    }),
  );
}
