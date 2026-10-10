import assert from 'node:assert/strict';
import test from 'node:test';
import { authLoginError, authUnavailableMessage, createAuthDemo, readAuthScenario, validateAuth } from '../../src/data/auth-demo.ts';
test('Auth facade keeps exact Source command delays and accepts no credentials', async () => {
  const durations: number[] = [], adapter = createAuthDemo(async duration => { durations.push(duration); });
  for (const kind of ['login', 'signup', 'forgot', 'reset', 'verify', 'resend'] as const) await adapter.execute({ kind }, true);
  await adapter.execute({ kind: 'social', provider: 'Google' }, true);
  assert.deepEqual(durations, [750, 800, 700, 700, 0, 0, 800]);
  assert.deepEqual(adapter.draft, { email: 'hello@gr8rstudio.com', name: '' });
});
test('Unavailable never invokes delay; error scenario never creates identity', async () => {
  let waits = 0; const adapter = createAuthDemo(async () => { waits++; }, 'login-error');
  await assert.rejects(adapter.execute({ kind: 'login' }, false), { message: authUnavailableMessage }); assert.equal(waits, 0);
  await assert.rejects(adapter.execute({ kind: 'login' }, true), { message: authLoginError }); assert.equal(waits, 1);
  assert.equal(readAuthScenario({ getItem: () => 'login-error' }), 'login-error');
  assert.equal(readAuthScenario({ getItem: () => 'unknown' }), 'normal');
  assert.equal(readAuthScenario({ getItem: () => { throw Error(); } }), 'normal');
});
test('Auth reset invalidates pending flow and only retains memory drafts', () => {
  const adapter = createAuthDemo(); adapter.draft.email = 'sample@example.com'; adapter.demoEnabled = true; adapter.resendUntil = 99999;
  adapter.reset(); assert.equal(adapter.generation, 1); assert.equal(adapter.demoEnabled, false); assert.equal(adapter.resendUntil, 0);
  assert.deepEqual(adapter.draft, { email: 'hello@gr8rstudio.com', name: '' });
});
test('Validation preserves Source email, strength and confirmation quirks', () => {
  assert.deepEqual(validateAuth('login', { email: 'x', name: '' }, '', ''), { email: 'Enter a valid email, like name@company.com', pw: 'Enter your password' });
  assert.deepEqual(validateAuth('login', { email: ' name@example.com ', name: '' }, 'x', ''), {});
  assert.deepEqual(validateAuth('forgot', { email: '', name: '' }, '', ''), { email: 'Enter the email you use to sign in' });
  assert.deepEqual(validateAuth('signup', { email: '', name: '' }, 'abcdefghij', ''), { name: 'Enter your name', email: 'Enter a valid work email', pw: 'Use at least 10 characters, including a number or symbol' });
  assert.deepEqual(validateAuth('reset', { email: '', name: '' }, 'abcdefghij ', 'different'), { pw2: "Passwords don't match" });
});
