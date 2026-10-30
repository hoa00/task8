import { ownProcessTree } from '/Users/hoadev/Projects/ai-v3/work-management-suite/tests/support/account-links-processes.mjs';
import { accountLinkSources } from '/Users/hoadev/Projects/ai-v3/work-management-suite/tests/support/account-links-source-binding.mjs';
import assert from 'node:assert/strict';
import { protectedRootsSnapshot } from '/Users/hoadev/Projects/ai-v3/work-management-suite/tests/support/account-link-preservation.mjs';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = await import(wranglerRequire.resolve('miniflare'));
import { openAccountLinks } from '../../scripts/oidc-account-links-adapter.mjs';
import { newId } from '../../src/shared/ids.ts';
import { seedRows } from '../../scripts/seed-data.mjs';
import { withReadKeys } from '../../scripts/read-keys.mjs';
import { createHash } from 'node:crypto';
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const seed = seedRows();
process.umask(0o077);
const root = resolve(import.meta.dirname, '../../../..');
const app = 'task8',
  issuer = 'https://identity-service.demo/api/auth';
const out = process.env.ACCOUNT_LINK_EVIDENCE;
if (!out) throw new Error('EXPLICIT_EVIDENCE_PATH_REQUIRED');
const dir = resolve(
  '/Users/hoadev/Projects/ai-v3/work-management-suite/.artifacts/account-link-tests',
  'task8-' + Date.now(),
);
await mkdir(dir, { recursive: true, mode: 0o700 });
const persist = resolve(dir, 'storage');
await mkdir(persist, { mode: 0o700 });
const report = {
  app,
  started: new Date().toISOString(),
  pid: process.pid,
  namespace: dir,
  layer: 'native Workerd/D1; controlled operator fixtures, no provider-login claim',
  backups: [],
  cases: [],
};
let runtime, fixture;
const save = () => writeFile(out, JSON.stringify(report, null, 2) + '\n');
const check = async (name, action) => {
  try {
    const details = await action();
    report.cases.push({ name, status: 'PASS', details });
  } catch (error) {
    report.cases.push({
      name,
      status: 'FAIL',
      errorType: error.name,
      safeCategory: [
        'PRIVATE_STORAGE_REQUIRED',
        'LOCAL_STORAGE_REQUIRED',
        'DEFAULT_STORAGE_FORBIDDEN',
        'EADDRINUSE',
        'ENOENT',
        'disposed',
        'locked',
        'SQLITE',
        'D1_ERROR',
        'RPC',
        'already exists',
        'build failed',
      ].find((code) => String(error.message).includes(code)),
      frames: error.stack
        ?.split('\n')
        .filter((line) => /account-links[^ ]*\.(mjs|ts):/u.test(line))
        .map((line) => line.replace(/^.*?(account-links[^ ]*\.(mjs|ts):[0-9:]+).*$/u, '$1'))
        .slice(0, 4),
      assertion:
        error.code === 'ERR_ASSERTION'
          ? { actual: error.actual, expected: error.expected, operator: error.operator }
          : undefined,
    });
    throw new Error('NATIVE_CASE_FAILED', { cause: error });
  } finally {
    await save();
  }
};
const nativeOptions = () => ({
  ...convertV4MiniflareOptions({
    workers: [
      {
        name: 'fixture',
        modules: true,
        script: 'export default {fetch(){return new Response(null,{status:404})}}',
        compatibilityDate: '2026-10-08',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: { DB: '00000000-0000-4000-8000-000000000030' },
      },
    ],
    host: '127.0.0.1',
    port: 0,
    cf: false,
  }),
  resourcePersistencePath: persist,
});
async function fixtureDb() {
  fixture = new Miniflare(nativeOptions());
  await fixture.ready;
  return fixture.getD1Database('DB', 'fixture');
}
async function backup(name) {
  const path = resolve(dir, name);
  await cp(persist, path, { recursive: true });
  report.backups.push({ name, path, writerStopped: true });
}
async function open() {
  runtime = await openAccountLinks({
    persist,
    scratch: dir,
    storageAlias: 'wu08-task8',
    environment: 'local',
  });
  (report.runtimes ??= []).push({ ...runtime.runtime, processes: ownProcessTree() });
}
async function stop() {
  if (runtime) {
    await runtime.close();
    runtime = null;
  }
}
async function mutate(sql, params = []) {
  await stop();
  const db = await fixtureDb();
  try {
    await db
      .prepare(sql)
      .bind(...params)
      .run();
  } finally {
    await fixture.dispose();
    fixture = null;
  }
  await open();
}
async function rows(sql, params = []) {
  await stop();
  const db = await fixtureDb();
  try {
    return (
      await db
        .prepare(sql)
        .bind(...params)
        .all()
    ).results;
  } finally {
    await fixture.dispose();
    fixture = null;
    await open();
  }
}
async function businessSnapshot() {
  await stop();
  const db = await fixtureDb();
  const result = {};
  try {
    const tables = (
      await db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'oidc%' ORDER BY name",
        )
        .all()
    ).results;
    for (const { name } of tables) {
      assert.match(name, /^[a-zA-Z0-9_]+$/u);
      const data = (await db.prepare('SELECT * FROM "' + name + '"').all()).results;
      result[name] = {
        rows: data.length,
        digest: digest(data.map((row) => JSON.stringify(row)).sort()),
      };
    }
    return result;
  } finally {
    await fixture.dispose();
    fixture = null;
    await open();
  }
}
const userId = seed.rows.users[0].id,
  otherId = seed.rows.users[1].id;
const assertions = seed.rows.workspaceMembers
  .filter((member) => member.userId === userId)
  .map((member) => ({ workspaceId: member.workspaceId, memberId: member.id }));
const target = {
  localUserId: userId,
  source: { kind: 'existing-local-user', localUserId: userId },
  expectedLink: 'absent-or-identical',
  verifyOnlyMemberships: assertions,
};
let serial = 0;
async function command(subject, extra = {}) {
  serial++;
  return {
    manifestId: 'native-' + serial,
    manifestDigest: digest({ serial, subject }),
    entryId: 'person',
    issuer,
    subject,
    target,
    snapshot: await runtime.inspect(issuer, subject, target),
    actor: 'fixture-operator',
    correlation: 'native-' + serial,
    candidateId: newId(),
    marker: randomUUID(),
    now: Date.now(),
    ...extra,
  };
}
try {
  report.defaultsBefore = await protectedRootsSnapshot();
  report.sourcesBefore = await accountLinkSources(resolve(root, '../work-management-suite'));
  await backup('empty-before-schema');
  let db = await fixtureDb();
  for (const name of (await readdir(resolve(root, 'apps/api/src/db/migrations')))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    await db.batch(
      (await readFile(resolve(root, 'apps/api/src/db/migrations', name), 'utf8'))
        .split('--> statement-breakpoint')
        .map((sql) => sql.trim())
        .filter(Boolean)
        .map((sql) => db.prepare(sql)),
    );
  }
  await fixture.dispose();
  fixture = null;
  await backup('before-populate');
  db = await fixtureDb();
  for (const [table, primaryRows] of Object.entries(seed.rows)) {
    const data = [...primaryRows, ...(seed.secondary[table] ?? [])];
    for (let offset = 0; offset < data.length; offset += 30)
      await db.batch(
        data.slice(offset, offset + 30).map((source) => {
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
  await fixture.dispose();
  fixture = null;
  await backup('populated-before-link');
  await open();
  const before = await businessSnapshot();
  report.before = before;
  await check('read-only-plan-preserves-every-row', async () => {
    const first = await command('Opaque/Person-A:Case');
    report.firstPlan = {
      outcome: first.snapshot.outcome,
      memberCount: first.snapshot.memberships.length,
      expectedMembers: assertions.length,
    };
    assert.equal(first.snapshot.outcome, 'create-link');
    assert.deepEqual(await businessSnapshot(), before);
    return { planned: first.snapshot.outcome, members: assertions.length };
  });
  await check('missing-user-and-cross-membership-rejected', async () => {
    const missing = {
      ...target,
      localUserId: '01a11abd-aa80-7000-8000-000000000099',
      source: { kind: 'existing-local-user', localUserId: '01a11abd-aa80-7000-8000-000000000099' },
    };
    assert.equal((await runtime.inspect(issuer, 'opaque', missing)).outcome, 'missing-user');
    const wrong = {
      ...target,
      localUserId: otherId,
      source: { kind: 'existing-local-user', localUserId: otherId },
    };
    assert.equal((await runtime.inspect(issuer, 'opaque', wrong)).outcome, 'missing-membership');
  });
  let applied, original;
  await check('apply-repeat-canonical-no-link-mutation', async () => {
    original = await command('Opaque/Person-A:Case');
    applied = await runtime.apply(original);
    assert.equal(applied.outcome, 'created-by-this-operation');
    const once = await rows('SELECT * FROM oidcIdentityLinks');
    assert.deepEqual(
      await runtime.apply({ ...original, candidateId: newId(), marker: randomUUID() }),
      applied,
    );
    assert.deepEqual(await rows('SELECT * FROM oidcIdentityLinks'), once);
  });
  await check('known-stale-rejection-and-readonly-recovery-current-state', async () => {
    assert.deepEqual(await runtime.lookup(original), applied);
    await mutate('UPDATE users SET version=version+1 WHERE id=?', [userId]);
    assert.equal(await runtime.lookup(original), null);
    await assert.rejects(runtime.apply(original), (error) => error.code === 'STALE_PLAN');
    await mutate('UPDATE users SET version=version-1 WHERE id=?', [userId]);
  });
  await check('same-manifest-different-payload-and-cross-user-rejected', async () => {
    await assert.rejects(runtime.apply({ ...original, manifestDigest: digest('other') }));
    const wrong = {
      ...target,
      localUserId: otherId,
      source: { kind: 'existing-local-user', localUserId: otherId },
      verifyOnlyMemberships: [],
    };
    assert.equal((await runtime.inspect(issuer, original.subject, wrong)).outcome, 'conflict');
    const different = await command('other-subject');
    assert.equal(different.snapshot.outcome, 'conflict');
    await assert.rejects(runtime.apply(different));
  });
  await check(
    'manifest-id-different-entry-payload-rejects-before-root-without-orphan',
    async () => {
      const user = seed.rows.users[3].id,
        selected = {
          ...target,
          localUserId: user,
          source: { kind: 'existing-local-user', localUserId: user },
          verifyOnlyMemberships: [],
        },
        subject = 'Opaque:ConflictingManifest';
      const base = await command(subject, {
        target: selected,
        snapshot: await runtime.inspect(issuer, subject, selected),
        manifestId: original.manifestId,
        entryId: 'other-entry',
        manifestDigest: digest('different-payload'),
      });
      await assert.rejects(runtime.apply(base));
      assert.equal(
        (await rows('SELECT id FROM oidcIdentityLinks WHERE subject=?', [subject])).length,
        0,
      );
      assert.equal(
        (
          await rows('SELECT entryId FROM oidcLinkOperations WHERE manifestId=?', [
            original.manifestId,
          ])
        ).length,
        1,
      );
    },
  );
  let existingReceipt;
  await check('already-linked-does-not-change-link-provenance', async () => {
    const cmd = await command(original.subject);
    existingReceipt = await runtime.apply(cmd);
    assert.equal(existingReceipt.outcome, 'already-linked');
    const link = await rows('SELECT * FROM oidcIdentityLinks');
    const result = await runtime.revoke(existingReceipt, {
      actor: 'fixture-operator',
      correlation: 'noop',
      marker: randomUUID(),
      now: Date.now(),
      kind: 'rollback',
    });
    assert.deepEqual(result, existingReceipt);
    assert.deepEqual(await rows('SELECT * FROM oidcIdentityLinks'), link);
  });
  await check('modified-link-revision-rollback-conflict', async () => {
    await mutate('UPDATE oidcIdentityLinks SET revision=revision+1 WHERE id=?', [applied.linkId]);
    await assert.rejects(
      runtime.revoke(applied, {
        actor: 'fixture-operator',
        correlation: 'conflict',
        marker: randomUUID(),
        now: Date.now(),
        kind: 'rollback',
      }),
    );
    await mutate('UPDATE oidcIdentityLinks SET revision=revision-1 WHERE id=?', [applied.linkId]);
  });
  await check('rollback-revoke-ciphertext-audit-idempotency', async () => {
    const now = Date.now();
    await mutate(
      'INSERT INTO oidcAppSessions(id,sidHash,linkId,userId,issuer,subject,clientId,providerSid,bundle,createdAt,expiresAt,authorityValidatedAt,accessExpiresAt,refreshInput,refreshAttemptAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        newId(),
        'a'.repeat(64),
        applied.linkId,
        userId,
        issuer,
        original.subject,
        'fixture-client',
        'fixture-sid-reference',
        'fixture-ciphertext',
        now,
        now + 28800000,
        now,
        now + 300000,
        'fixture-encrypted-input',
        now,
      ],
    );
    const context = {
      actor: 'fixture-operator',
      correlation: 'rollback',
      marker: randomUUID(),
      now: Date.now(),
      kind: 'rollback',
    };
    const revoked = await runtime.revoke(applied, context);
    assert.equal(revoked.revokedRevision, 2);
    assert.deepEqual(await runtime.revoke(applied, { ...context, marker: randomUUID() }), revoked);
    const sessions = await rows(
      'SELECT bundle,refreshInput,refreshAttemptAt,leaseOwner,leaseUntil,revision,revokedAt FROM oidcAppSessions WHERE linkId=?',
      [applied.linkId],
    );
    assert.ok(
      sessions.every(
        (row) =>
          row.bundle === '' &&
          row.refreshInput === null &&
          row.refreshAttemptAt === 0 &&
          row.leaseOwner === null &&
          row.leaseUntil === 0 &&
          row.revokedAt !== null,
      ),
    );
    const audit = await rows(
      'SELECT kind,actor,correlation,beforeRevision,afterRevision FROM oidcLinkAudit WHERE linkId=? ORDER BY createdAt',
      [applied.linkId],
    );
    assert.equal(audit.filter((row) => row.kind === 'rollback').length, 1);
    report.revocation = { sessions: sessions.length, audit };
  });
  await check('repeat-rollback-after-ledger-still-rechecks-current-revision', async () => {
    await mutate('UPDATE oidcIdentityLinks SET revision=revision+1 WHERE id=?', [applied.linkId]);
    await assert.rejects(
      runtime.revoke(applied, {
        actor: 'fixture-operator',
        correlation: 'modified-after-rollback',
        marker: randomUUID(),
        now: Date.now(),
        kind: 'rollback',
      }),
    );
    await mutate('UPDATE oidcIdentityLinks SET revision=revision-1 WHERE id=?', [applied.linkId]);
  });
  await check('reapply-reassign-reactivate-after-rollback-rejected', async () => {
    await assert.rejects(runtime.apply(original));
    const retry = await command(original.subject);
    assert.equal(retry.snapshot.outcome, 'conflict');
    await assert.rejects(runtime.apply(retry));
    assert.equal((await runtime.inspect(issuer, 'new-subject', target)).outcome, 'conflict');
  });
  // Independent users keep uniqueness tests independent of the revoked link.
  const freshTarget = {
    ...target,
    localUserId: otherId,
    source: { kind: 'existing-local-user', localUserId: otherId },
    verifyOnlyMemberships: [],
  };
  await check('concurrent-apply-one-canonical-link-and-receipt', async () => {
    const subject = 'Opaque:Concurrent';
    const base = await command(subject, {
      target: freshTarget,
      snapshot: await runtime.inspect(issuer, subject, freshTarget),
    });
    const results = await Promise.all([
      runtime.apply(base),
      runtime.apply({ ...base, marker: randomUUID(), candidateId: newId() }),
    ]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(
      (await rows('SELECT id FROM oidcIdentityLinks WHERE subject=?', [subject])).length,
      1,
    );
    assert.equal(
      (await rows('SELECT entryId FROM oidcLinkOperations WHERE manifestId=?', [base.manifestId]))
        .length,
      1,
    );
  });
  await check('durable-canonical-recovery-after-controlled-reply-loss', async () => {
    const user = seed.rows.users[3].id,
      selected = {
        ...target,
        localUserId: user,
        source: { kind: 'existing-local-user', localUserId: user },
        verifyOnlyMemberships: [],
      };
    const subject = 'Opaque:LostReply',
      base = await command(subject, {
        target: selected,
        snapshot: await runtime.inspect(issuer, subject, selected),
      });
    let committed;
    await assert.rejects(
      (async () => {
        committed = await runtime.apply(base);
        throw new Error('CONTROLLED_REPLY_LOSS');
      })(),
    );
    const beforeLookup = await rows('SELECT * FROM oidcLinkOperations WHERE manifestId=?', [
      base.manifestId,
    ]);
    assert.deepEqual(await runtime.lookup(base), committed);
    assert.deepEqual(
      await rows('SELECT * FROM oidcLinkOperations WHERE manifestId=?', [base.manifestId]),
      beforeLookup,
    );
  });
  const zeroTarget = {
    ...target,
    localUserId: seed.rows.users[2].id,
    source: { kind: 'existing-local-user', localUserId: seed.rows.users[2].id },
    verifyOnlyMemberships: [],
  };
  await check('native-fault-rolls-back-link-ledger-and-audit', async () => {
    const subject = 'Opaque:Fault';
    const base = await command(subject, {
      target: zeroTarget,
      snapshot: await runtime.inspect(issuer, subject, zeroTarget),
    });
    await mutate(
      "CREATE TRIGGER fixture_abort_ledger BEFORE INSERT ON oidcLinkOperations BEGIN SELECT RAISE(ABORT,'controlled-fault'); END",
    );
    await assert.rejects(runtime.apply(base));
    assert.equal(
      (await rows('SELECT id FROM oidcIdentityLinks WHERE subject=?', [subject])).length,
      0,
    );
    assert.equal(
      (await rows('SELECT entryId FROM oidcLinkOperations WHERE manifestId=?', [base.manifestId]))
        .length,
      0,
    );
    await mutate('DROP TRIGGER fixture_abort_ledger');
  });
  await check('zero-row-user-guard-no-orphan-ledger', async () => {
    const subject = 'Opaque:ZeroRoot';
    const base = await command(subject, {
      target: zeroTarget,
      snapshot: await runtime.inspect(issuer, subject, zeroTarget),
    });
    await mutate('UPDATE users SET version=version+1 WHERE id=?', [zeroTarget.localUserId]);
    await assert.rejects(runtime.apply(base));
    assert.equal(
      (await rows('SELECT id FROM oidcIdentityLinks WHERE subject=?', [subject])).length,
      0,
    );
    assert.equal(
      (await rows('SELECT entryId FROM oidcLinkOperations WHERE manifestId=?', [base.manifestId]))
        .length,
      0,
    );
    await mutate('UPDATE users SET version=version-1 WHERE id=?', [zeroTarget.localUserId]);
  });
  await check('exact-business-and-legacy-preservation', async () => {
    const after = await businessSnapshot();
    assert.deepEqual(after, before);
    report.after = after;
  });
  await stop();
  await backup('after-rollback');
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.failure = {
    type: error.name,
    code: error.code,
    frames: error.stack
      ?.split('\n')
      .filter((line) => /account-links[^ ]*\.(mjs|ts):/u.test(line))
      .map((line) => line.replace(/^.*?(account-links[^ ]*\.(mjs|ts):[0-9:]+).*$/u, '$1'))
      .slice(0, 4),
  };
  process.exitCode = 1;
} finally {
  if (runtime) await runtime.close();
  if (fixture) await fixture.dispose();
  report.defaultsAfter = await protectedRootsSnapshot();
  if (JSON.stringify(report.defaultsBefore) !== JSON.stringify(report.defaultsAfter)) {
    report.status = 'FAIL';
    process.exitCode = 1;
  }
  report.sourcesAfter = await accountLinkSources(resolve(root, '../work-management-suite'));
  if (JSON.stringify(report.sourcesBefore) !== JSON.stringify(report.sourcesAfter)) {
    report.status = 'FAIL';
    process.exitCode = 1;
  }
  report.finished = new Date().toISOString();
  await save();
  console.log(
    JSON.stringify({
      status: report.status,
      cases: report.cases.length,
      failed: report.cases.filter((item) => item.status === 'FAIL').map((item) => item.name),
      evidence: out,
    }),
  );
}
