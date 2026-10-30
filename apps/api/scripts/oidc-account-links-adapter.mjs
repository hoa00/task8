import { realpath, stat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { build } = await import(wranglerRequire.resolve('esbuild'));
const { Miniflare, convertV4MiniflareOptions } = await import(wranglerRequire.resolve('miniflare'));

const root = resolve(import.meta.dirname, '../../..');
const sha = (value) => createHash('sha256').update(value).digest('hex');
export async function openAccountLinks({ persist, scratch, storageAlias, environment }) {
  if (environment !== 'local' || !/^[a-zA-Z0-9._-]{1,100}$/u.test(storageAlias ?? ''))
    throw new Error('LOCAL_STORAGE_REQUIRED');
  const storage = await realpath(persist),
    output = await realpath(scratch);
  const protectedRoots = [resolve(root, 'apps/api/.wrangler/state')];
  if (protectedRoots.some((path) => storage === path || storage.startsWith(path + '/')))
    throw new Error('DEFAULT_STORAGE_FORBIDDEN');
  const metadata = await stat(storage);
  if (!metadata.isDirectory() || metadata.mode & 0o077 || !(await stat(output)).isDirectory())
    throw new Error('PRIVATE_STORAGE_REQUIRED');
  // Exact native storage object for the pinned local D1 binding; no root fallback or blank database creation.
  const databaseFile = resolve(storage, 'd1/miniflare-D1DatabaseObject/5e1cca6ab1f3efc1b3f355b1a36ee1d5d097f17907ac670e2709efa0e992fb0d.sqlite');
  const databaseMetadata = await stat(databaseFile).catch(() => null);
  if (!databaseMetadata?.isFile() || !databaseMetadata.size || await realpath(databaseFile) !== databaseFile)
    throw Object.assign(new Error('LOCAL_D1_STORAGE_MISSING'), {code:'LOCAL_D1_STORAGE_MISSING'});
  const fingerprint = sha(
    JSON.stringify({
      storage,
      dev: metadata.dev,
      ino: metadata.ino,
      databaseId: '00000000-0000-4000-8000-000000000030',
      storageAlias,
    }),
  );
  const entry = resolve(root, 'apps/api/scripts/oidc-account-links.worker.ts'),
    outfile = resolve(output, 'task8-link-operator.mjs');
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    external: ['node:*', 'cloudflare:workers'],
    logLevel: 'silent',
  });
  const operatorKey = randomBytes(32).toString('base64url');
  const mf = new Miniflare({
    ...convertV4MiniflareOptions({
      workers: [
        {
          name: 'operator',
          modulesRoot: output,
          bindings: { OPERATOR_KEY: operatorKey },
          compatibilityDate: '2026-10-08',
          compatibilityFlags: ['nodejs_compat'],
          modules: [{ type: 'ESModule', path: outfile }],
          d1Databases: { DB: '00000000-0000-4000-8000-000000000030' },
        },
      ],
      host: '127.0.0.1',
      port: 0,
      cf: false,
    }),
    resourcePersistencePath: storage,
  });
  try {
    const readyUrl = await mf.ready;
    const operator = await mf.getWorker('operator');
    const call = async (method, args) => {
      const response = await operator.fetch(
        new Request('http://local-operator/', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-local-operator-key': operatorKey },
          body: JSON.stringify({ method, args }),
        }),
      );
      const data = await response.json();
      if (!response.ok)
        throw Object.assign(new Error('OWNER_OPERATION_REJECTED'), {
          code: data.known ? data.code : 'OWNER_STORAGE_FAILURE',
        });
      return data;
    };
    return {
      inspect: (...args) => call('inspect', args),
      apply: (input) => call('apply', [input]),
      revoke: (...args) => call('revoke', args),
      lookup: (...args) => call('lookup', args),
      profile: async () => ({
        app: 'task8',
        environment: 'local',
        storageAlias,
        storagePath: storage,
        storageFingerprint: fingerprint,
        head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        sourceDigest: sha(await readFile(outfile)),
        schemaDigest: sha(JSON.stringify(await call('profile', []))),
      }),
      runtime: {
        pid: process.pid,
        loopbackUrl: String(readyUrl),
        persist: storage,
        worktree: root,
      },
      close: () => mf.dispose(),
      // The native database handle is deliberately absent from the operator interface.
    };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}
