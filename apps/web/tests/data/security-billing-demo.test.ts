import assert from 'node:assert/strict';
import test from 'node:test';
import { createSecurityBillingDemo, demoSessions, readSecurityBillingScenario, securityBillingDemoClock, securityBillingScenarioKey, validateDemoCode, validateDemoPassword } from '../../src/data/security-billing-demo.ts';
import type { SecurityBillingDemoCommand, SecurityBillingDemoContext } from '../../src/data/security-billing-demo.ts';
const context: SecurityBillingDemoContext = { workspaceId: 'workspace-a', principalId: 'principal-a', demoEnabled: true, scenario: 'normal' };
const instant = async () => {};
test('source password validation preserves exact boundaries and copy', () => {
  assert.deepEqual(validateDemoPassword('', 'short', 'different'), { current: 'Enter your current password', next: 'Use at least 10 characters, including a number or symbol', confirmation: "Passwords don't match" });
  for (const password of ['abcdefgh1', 'abcdefghij']) assert.ok(validateDemoPassword('current', password, password).next);
  for (const password of ['abcdefgh1!', 'abcdefghij!']) assert.deepEqual(validateDemoPassword('current', password, password), {});
});
test('six-digit prototype code is format only; any six digits accepted', () => {
  for (const code of ['000000', '123456', ' 999999 ']) assert.equal(validateDemoCode(code), true);
  for (const code of ['', '12345', '1234567', 'abc123', '12 456', '１２３４５６']) assert.equal(validateDemoCode(code), false);
});
test('sample sessions/invoices and renewal use source fixed demo clock', () => {
  const service = createSecurityBillingDemo();
  assert.equal(securityBillingDemoClock.now(), '2026-10-08T09:00:00.000Z');
  assert.equal(service.renewalDate, '2026-10-15');
  assert.deepEqual(service.invoices.map(row => [row.id, row.date, row.amount]), [['INV-2026-009', '2026-09-15', '$96.00'], ['INV-2026-008', '2026-08-16', '$96.00'], ['INV-2026-007', '2026-07-16', '$80.00'], ['INV-2026-006', '2026-06-16', '$80.00']]);
  assert.equal(demoSessions.filter(row => row.current).length, 1);
});
test('unavailable rejects every mutation before wait/storage and leaves sample state', async () => {
  let writes = 0, waits = 0;
  const service = createSecurityBillingDemo(undefined, { getItem: () => null, setItem: () => { writes++; } }, async () => { waits++; });
  const unavailable = { ...context, demoEnabled: false }, before = service.read(unavailable);
  const commands: SecurityBillingDemoCommand[] = [{ kind: 'password' }, { kind: 'revokeSession', sessionId: 'se2' }, { kind: 'revokeOthers' }, { kind: 'twoFactor', enabled: true }, { kind: 'plan', plan: 'Business' }, { kind: 'payment', action: 'update' }];
  for (const command of commands) await assert.rejects(service.execute(unavailable, command), /unavailable/);
  assert.deepEqual(service.read(unavailable), before); assert.equal(writes, 0); assert.equal(waits, 0);
});
test('password completion waits 800ms and stores no credentials or state', async () => {
  let milliseconds = 0, release: (() => void) | undefined, writes = 0;
  const service = createSecurityBillingDemo(undefined, { getItem: () => null, setItem: () => { writes++; } }, delay => { milliseconds = delay; return new Promise<void>(resolve => { release = resolve; }); });
  const before = service.read(context), result = service.execute(context, { kind: 'password' });
  assert.equal(milliseconds, 800); assert.deepEqual(service.read(context), before); release!();
  assert.deepEqual(await result, before); assert.equal(writes, 0);
});
test('session revocation is scoped sample state, current device cannot be revoked', async () => {
  const service = createSecurityBillingDemo(undefined, undefined, instant);
  assert.deepEqual((await service.execute(context, { kind: 'revokeSession', sessionId: 'se2' })).sessionIds, ['se1', 'se3']);
  await assert.rejects(service.execute(context, { kind: 'revokeSession', sessionId: 'se1' }), /cannot be signed out/);
  assert.deepEqual((await service.execute(context, { kind: 'revokeOthers' })).sessionIds, ['se1']);
});
test('2FA and plan demo transitions persist only bounded fields and reload', async () => {
  const records = new Map<string, string>(), storage = { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } };
  const service = createSecurityBillingDemo(undefined, storage, instant);
  await service.execute(context, { kind: 'twoFactor', enabled: true }); await service.execute(context, { kind: 'plan', plan: 'Business' });
  assert.deepEqual(Object.keys(JSON.parse([...records.values()][0]!)).sort(), ['plan', 'sessionIds', 'twoFactorEnabled', 'version']);
  const reloaded = createSecurityBillingDemo(undefined, storage, instant); assert.equal(reloaded.read(context).twoFactorEnabled, true); assert.equal(reloaded.read(context).plan, 'Business');
  assert.equal((await reloaded.execute(context, { kind: 'twoFactor', enabled: false })).twoFactorEnabled, false); assert.equal((await reloaded.execute(context, { kind: 'plan', plan: 'Free' })).plan, 'Free');
  assert.equal(reloaded.read({ ...context, principalId: 'other' }).plan, 'Team'); assert.equal(reloaded.read({ ...context, workspaceId: 'other' }).twoFactorEnabled, false);
});
test('payment responses cannot mutate card, plan, sessions or payment records', async () => {
  let writes = 0; const service = createSecurityBillingDemo(undefined, { getItem: () => null, setItem: () => { writes++; } }, instant), before = service.read(context);
  for (const action of ['update', 'edit'] as const) assert.deepEqual(await service.execute(context, { kind: 'payment', action }), before);
  assert.equal(writes, 0);
});
test('explicit error scenario and storage failures retain prior state', async () => {
  const error = createSecurityBillingDemo(undefined, undefined, instant), fault = { ...context, scenario: 'error' as const }, before = error.read(fault);
  await assert.rejects(error.execute(fault, { kind: 'plan', plan: 'Business' }), /Demo operation failed/); assert.deepEqual(error.read(fault), before);
  const failedStorage = createSecurityBillingDemo(undefined, { getItem: () => null, setItem: () => { throw Error('storage unavailable'); } }, instant), stored = failedStorage.read(context);
  await assert.rejects(failedStorage.execute(context, { kind: 'twoFactor', enabled: true }), /storage unavailable/); assert.deepEqual(failedStorage.read(context), stored);
});
test('deterministic scenarios are separate scopes and loading holds mutation', async () => {
  let release: (() => void) | undefined, delay = 0;
  const service = createSecurityBillingDemo(undefined, undefined, milliseconds => { delay = milliseconds; return new Promise<void>(resolve => { release = resolve; }); });
  assert.equal(service.read({ ...context, scenario: 'enabled' }).twoFactorEnabled, true); assert.equal(service.read({ ...context, scenario: 'free' }).plan, 'Free'); assert.equal(service.read({ ...context, scenario: 'business' }).plan, 'Business'); assert.deepEqual(service.read({ ...context, scenario: 'current-session' }).sessionIds, ['se1']);
  const loading = { ...context, scenario: 'loading' as const }, result = service.execute(loading, { kind: 'plan', plan: 'Free' }); assert.equal(delay, 1200); assert.equal(service.read(loading).plan, 'Team'); release!(); assert.equal((await result).plan, 'Free'); assert.equal(service.read(context).plan, 'Team');
});
test('corrupt/foreign stored state cannot change demo or canonical state', () => {
  for (const raw of ['bad-json', JSON.stringify({ version: 1, plan: 'Team', twoFactorEnabled: false, sessionIds: [] }), JSON.stringify({ version: 1, plan: 'Team', twoFactorEnabled: false, sessionIds: ['se1'], password: 'not-a-credential' })]) {
    const service = createSecurityBillingDemo(undefined, { getItem: () => raw, setItem: () => {} }); assert.equal(service.read(context).version, 1); assert.deepEqual(service.read(context).sessionIds, ['se1', 'se2', 'se3']);
  }
});
test('scenario selection is explicit and safely defaults on invalid/blocked storage', () => {
  assert.equal(readSecurityBillingScenario({ getItem: key => key === securityBillingScenarioKey ? 'enabled' : null }), 'enabled');
  assert.equal(readSecurityBillingScenario({ getItem: () => 'unknown' }), 'normal'); assert.equal(readSecurityBillingScenario({ getItem: () => { throw Error('blocked'); } }), 'normal');
});
test('closing demo shows fresh disabled samples; a held operation remains in its old scope', async () => {
  let release: (() => void) | undefined;
  const service = createSecurityBillingDemo(undefined, undefined, () => new Promise<void>(resolve => { release = resolve; }));
  const loading = { ...context, scenario: 'loading' as const }, result = service.execute(loading, { kind: 'twoFactor', enabled: true });
  const changed = { ...loading, workspaceId: 'new-workspace', principalId: 'new-principal' };
  assert.equal(service.read(changed).twoFactorEnabled, false); release!(); await result;
  assert.equal(service.read(loading).twoFactorEnabled, true); assert.equal(service.read(changed).twoFactorEnabled, false);
  assert.equal(service.read({ ...loading, demoEnabled: false }).twoFactorEnabled, false);
  assert.equal(service.read({ ...context, scenario: 'business', demoEnabled: false }).plan, 'Team');
});
