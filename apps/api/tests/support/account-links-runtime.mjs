import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, readdir, mkdir, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { seedRows } from '../../scripts/seed-data.mjs';
import { withReadKeys } from '../../scripts/read-keys.mjs';
import { createControlledIdentityProvider } from './identity-provider.mjs';
import { newId } from '../../src/shared/ids.ts';
const api = resolve(import.meta.dirname, '../..'),
  root = resolve(api, '../..');
const require = createRequire(resolve(api, 'package.json')),
  wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { build } = await import(wranglerRequire.resolve('esbuild'));
const { Miniflare, convertV4MiniflareOptions } = await import(wranglerRequire.resolve('miniflare'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
export async function createAccountLinkRuntime({ dir, client, report }) {
  let mf, legacy;
  try {
    legacy = await createControlledIdentityProvider();
    report.legacy = {
      layer: 'F controlled ICT24H provider; actual Task8 SDK/Workerd/D1, not live ICT24H',
      pid: process.pid,
      loopbackUrl: legacy.providerUrl,
      publicKeySha256: hash(legacy.publicKey),
    };
    const fixture = seedRows(),
      persist = resolve(dir, 'task8-d1');
    await mkdir(persist, { recursive: true, mode: 0o700 });
    await cp(persist, resolve(dir, 'task8-before-schema'), { recursive: true });
    report.backups ??= [];
    report.backups.push({
      owner: 'task8',
      path: resolve(dir, 'task8-before-schema'),
      empty: true,
      writerStopped: true,
    });
    const probe = createServer();
    await new Promise((done, fail) => {
      probe.once('error', fail);
      probe.listen(4316, '127.0.0.1', done);
    });
    await new Promise((done) => probe.close(done));
    const outfile = resolve(dir, 'task8-application.mjs');
    await build({
      entryPoints: [resolve(api, 'src/index.ts')],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      external: ['node:*', 'cloudflare:workers'],
      banner: {
        js: "import {createRequire as createNativeRequire} from 'node:module'; const require=createNativeRequire('/task8.mjs');",
      },
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
      logLevel: 'silent',
    });
    await cp(resolve(api, 'src/shared/collation/icu78-en-US.wasm'), resolve(dir, 'task8-icu.wasm'));
    const bindings = {
      AUTH_MODE: 'ict24h',
      AUTH_PROVIDER_KEY: 'ict24h-identity',
      AUTH_PROVIDER_BASE_URL: 'https://identity.example.invalid',
      AUTH_TENANT_ID: legacy.tenant,
      AUTH_PUBLIC_KEY: legacy.publicKey,
      AUTH_SESSION_ENCRYPTION_KEY: legacy.secret,
      AUTH_SESSION_MAX_AGE_SECONDS: '1209600',
      STUDIO_ENV: 'local',
      LOCAL_USER_ID: fixture.rows.users[0].id,
      LOCAL_WORKSPACE_ID: fixture.rows.workspaces[0].id,
      AUTH_APP_ORIGIN: 'https://datamaker-task.demo',
      OIDC_ISSUER: 'https://identity-service.demo/api/auth',
      OIDC_CLIENT_ID: client.client_id,
      OIDC_CLIENT_SECRET: client.client_secret,
      RP_ENVIRONMENT: 'account-link-rehearsal',
      RP_TOKEN_ENCRYPTION_KEYSET: JSON.stringify({
        active: 'local',
        keys: { local: randomBytes(32).toString('base64url') },
      }),
    };
    await writeFile(resolve(dir, 'task8-runtime-input.json'), JSON.stringify(bindings), {
      mode: 0o600,
      flag: 'wx',
    });
    const options = () => ({
      ...convertV4MiniflareOptions({
        workers: [
          {
            name: 'task8-main',
            modulesRoot: dir,
            routes: ['https://datamaker-task.demo/*'],
            compatibilityDate: '2026-10-08',
            compatibilityFlags: ['nodejs_compat'],
            modules: [
              { type: 'ESModule', path: outfile },
              { type: 'CompiledWasm', path: resolve(dir, 'task8-icu.wasm') },
            ],
            bindings,
            d1Databases: { DB: '00000000-0000-4000-8000-000000000030' },
            r2Buckets: { FILES: 'wu08-files' },
            outboundService: async (request) => {
              const headers = new Headers(request.headers);
              for (const name of ['content-length', 'connection', 'transfer-encoding', 'host'])
                headers.delete(name);
              const targetUrl =
                new URL(request.url).origin === 'https://identity.example.invalid'
                  ? legacy.providerUrl + new URL(request.url).pathname
                  : request.url;
              const response = await fetch(targetUrl, {
                method: request.method,
                headers,
                redirect: 'manual',
                signal: AbortSignal.timeout(5000),
                ...(['GET', 'HEAD'].includes(request.method)
                  ? {}
                  : { body: await request.arrayBuffer() }),
              });
              const outputHeaders = new Headers(response.headers);
              outputHeaders.delete('content-length');
              outputHeaders.delete('content-encoding');
              return new Response(await response.arrayBuffer(), {
                status: response.status,
                headers: outputHeaders,
              });
            },
          },
        ],
        host: '127.0.0.1',
        port: 4316,
        cf: false,
      }),
      resourcePersistencePath: persist,
    });
    async function start() {
      mf = new Miniflare(options());
      await mf.ready;
      (report.runtimes ??= []).push({
        owner: 'task8',
        pid: process.pid,
        port: 4316,
        persist,
        worktree: root,
      });
    }
    async function stop() {
      if (mf) {
        await mf.dispose();
        mf = null;
      }
    }
    await start();
    let db = await mf.getD1Database('DB', 'task8-main');
    for (const name of (await readdir(resolve(api, 'src/db/migrations')))
      .filter((name) => name.endsWith('.sql'))
      .sort())
      await db.batch(
        (await readFile(resolve(api, 'src/db/migrations', name), 'utf8'))
          .split('--> statement-breakpoint')
          .map((sql) => sql.trim())
          .filter(Boolean)
          .map((sql) => db.prepare(sql)),
      );
    await stop();
    await cp(persist, resolve(dir, 'task8-before-populate'), { recursive: true });
    report.backups.push({
      owner: 'task8',
      path: resolve(dir, 'task8-before-populate'),
      writerStopped: true,
    });
    await start();
    db = await mf.getD1Database('DB', 'task8-main');
    for (const [table, primaryRows] of Object.entries(fixture.rows)) {
      const rows = [...primaryRows, ...(fixture.secondary[table] ?? [])];
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
    const userId = fixture.rows.users[0].id,
      legacySubject = legacy.accounts[0].id;
    await db
      .prepare(
        'INSERT INTO authIdentities(id,providerKey,tenant,subject,userId,createdAt) VALUES(?,?,?,?,?,?)',
      )
      .bind(newId(), 'ict24h-identity', legacy.tenant, legacySubject, userId, Date.now())
      .run();
    const target = {
      localUserId: userId,
      source: {
        kind: 'legacy-ict24h',
        providerKey: 'ict24h-identity',
        tenant: legacy.tenant,
        subject: legacySubject,
      },
      expectedLink: 'absent-or-identical',
      verifyOnlyMemberships: [
        ...fixture.rows.workspaceMembers,
        ...(fixture.secondary.workspaceMembers ?? []),
      ]
        .filter((member) => member.userId === userId)
        .map((member) => ({ workspaceId: member.workspaceId, memberId: member.id })),
    };
    const http = async (path, { method = 'GET', cookie, body, headers = {} } = {}) =>
      (await mf.getWorker('task8-main')).fetch(
        new Request('https://datamaker-task.demo' + path, {
          method,
          redirect: 'manual',
          headers: { ...headers, ...(cookie ? { cookie } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
    const preauth = await http('/auth/context');
    if (preauth.status !== 200) throw new Error('LEGACY_PREAUTH_FAILED');
    const preauthCookie = preauth.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; '),
      csrf = (await preauth.json()).csrf;
    const signed = await http('/api/v1/auth/login', {
      method: 'POST',
      cookie: preauthCookie,
      headers: {
        origin: 'https://datamaker-task.demo',
        'content-type': 'application/json',
        'x-csrf-token': csrf,
      },
      body: { email: legacy.accounts[0].email, password: 'correct-password', remember: true },
    });
    if (signed.status !== 200) throw new Error('LEGACY_LOGIN_FAILED');
    const legacyCookie = signed.headers
      .getSetCookie()
      .filter((value) => !value.includes('Max-Age=0'))
      .map((value) => value.split(';')[0])
      .join('; ');
    const loginData = (await signed.json()).data;
    if (loginData.user.id !== userId) throw new Error('LEGACY_USER_MISMATCH');
    report.legacy.initialLogin = 200;
    report.legacy.rememberedMaxAgeSeconds = 1209600;
    return {
      persist,
      target,
      fixture,
      legacyCookie,
      legacyEmail: legacy.accounts[0].email,
      async close() {
        await stop();
        await legacy.close();
      },
      stop,
      start,
      async mode(mode) {
        if (!['ict24h', 'oidc'].includes(mode)) throw new Error('INVALID_REHEARSAL_MODE');
        await stop();
        bindings.AUTH_MODE = mode;
        await start();
      },
      async backup(name) {
        await stop();
        const path = resolve(dir, 'task8-' + name);
        await cp(persist, path, { recursive: true });
        report.backups.push({ owner: 'task8', path, writerStopped: true });
        await start();
      },
      http,
      async snapshot(includeAuth = false) {
        const database = await mf.getD1Database('DB', 'task8-main'),
          data = {};
        const tables = (
          await database
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND (?=1 OR name NOT LIKE 'oidc%') ORDER BY name",
            )
            .bind(Number(includeAuth))
            .all()
        ).results;
        for (const { name } of tables) {
          if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('UNSAFE_TABLE');
          const rows = (await database.prepare('SELECT * FROM "' + name + '"').all()).results;
          data[name] = {
            count: rows.length,
            digest: hash(JSON.stringify(rows.map((row) => JSON.stringify(row)).sort())),
          };
        }
        return data;
      },
      async authState() {
        const database = await mf.getD1Database('DB', 'task8-main');
        return (
          await database
            .prepare(
              "SELECT status,revision,(SELECT COUNT(*) FROM oidcAppSessions s WHERE s.linkId=l.id AND (s.bundle<>'' OR s.refreshInput IS NOT NULL OR s.revokedAt IS NULL)) liveMaterial FROM oidcIdentityLinks l",
            )
            .all()
        ).results;
      },
      async membershipFault(delta) {
        const database = await mf.getD1Database('DB', 'task8-main');
        await database
          .prepare('UPDATE workspaceMembers SET version=version+? WHERE id=?')
          .bind(delta, target.verifyOnlyMemberships[0].memberId)
          .run();
      },
      async fault(enabled) {
        const database = await mf.getD1Database('DB', 'task8-main');
        await database
          .prepare(
            enabled
              ? "CREATE TRIGGER fixture_abort_links BEFORE INSERT ON oidcLinkOperations BEGIN SELECT RAISE(ABORT,'controlled-fault'); END"
              : 'DROP TRIGGER fixture_abort_links',
          )
          .run();
      },
    };
  } catch (error) {
    if (mf) await mf.dispose();
    if (legacy) await legacy.close();
    throw error;
  }
}
