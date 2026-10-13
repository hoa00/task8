import { activeMemberGrant } from '../support/auth-grant.mjs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createHarness, freePort, localFetch, root } from '../support/harness.mjs';
import { createControlledIdentityProvider } from '../support/identity-provider.mjs';
import { seedRows } from '../../scripts/seed-data.mjs';

const report = { status: 'RUNNING', commands: [], probes: [], requests: [] };
const h = await createHarness('auth-web', report),
  provider = await createControlledIdentityProvider();
const webPort = await freePort(),
  web = `http://127.0.0.1:${webPort}`;
let browser;
const probe = (name) => report.probes.push({ name, status: 'PASS' });
async function sql(query, parameters = []) {
  const response = await localFetch(h.baseUrl + '/__auth/sql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sql: query, parameters }),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200);
  return (await response.json()).results;
}
async function session(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/session');
    return { status: response.status, body: await response.json() };
  });
}
async function signIn(page, account = 0) {
  await page.locator('#l-email').fill(provider.accounts[account].email);
  await page.locator('#l-pw').fill('correct-password');
  await page.locator('#login-btn').click();
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
  await h.start(
    'browser',
    {
      AUTH_MODE: 'ict24h',
      AUTH_PROVIDER_KEY: 'ict24h-identity',
      AUTH_PROVIDER_BASE_URL: 'https://identity.example.invalid',
      AUTH_TENANT_ID: provider.tenant,
      AUTH_APP_ORIGIN: web,
      AUTH_PUBLIC_KEY: provider.publicKey,
      TEST_PROVIDER_URL: provider.providerUrl,
    },
    false,
    { AUTH_SESSION_ENCRYPTION_KEY: provider.secret },
  );
  await h.launch(
    'web',
    [
      'env',
      'VITE_DATA_MODE=http',
      'TASK8_API_PROXY_TARGET=' + h.baseUrl,
      'pnpm',
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
      '--strictPort',
    ],
    resolve(root, 'apps/web'),
  );
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
  });
  await context.addInitScript(() => {
    localStorage.setItem('task8.ui.language.v1', 'en');
    localStorage.setItem('task8.ui.theme.v1', JSON.stringify({ theme: 'light', motion: 'reduce' }));
  });
  const page = await context.newPage();
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/'))
      report.requests.push({
        path: url.pathname,
        method: response.request().method(),
        status: response.status(),
      });
  });
  await page.goto(web + '/#tasks');
  await page.locator('#l-email').waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');
  probe('legacy-hash-401-renders-login');
  assert.equal(
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).isDisabled(),
    true,
  );
  await page.screenshot({ path: resolve(h.out, 'http-login-base.png') });
  await page.goto(web + '/signup');
  await page.getByRole('heading', { name: 'This option is not available.', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Open demo', exact: true }).count(), 0);
  probe('unsupported-signup-is-not-demo-or-success');
  await page.goto(web + '/forgot-password?state=sent');
  await page.getByRole('heading', { name: 'This option is not available.', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('heading', { name: 'Check your email', exact: true }).count(),
    0,
  );
  probe('unsupported-email-flow-never-claims-delivery');
  await page.goto(web + '/login');
  await page.locator('#l-email').fill(provider.accounts[0].email);
  await page.locator('#l-pw').fill('wrong-password');
  await page.locator('#login-btn').click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'The email or password is incorrect.' })
    .waitFor();
  probe('credential-error-displayed');
  assert.equal((await sql('SELECT count(*) count FROM authSessions'))[0].count, 0);
  provider.state.loginUnavailable = true;
  await page.locator('#l-pw').fill('correct-password');
  await page.locator('#l-rem').click();
  await page.locator('#login-btn').click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Sign-in is temporarily unavailable.' })
    .waitFor();
  assert.equal(await page.locator('#l-email').inputValue(), provider.accounts[0].email);
  assert.equal(await page.locator('#l-pw').inputValue(), 'correct-password');
  assert.equal(await page.locator('#l-rem').isChecked(), false);
  probe('login503-preserves-draft-and-remember');
  provider.state.loginUnavailable = false;
  await page.locator('#login-btn').click();
  await page.locator('[data-waiting-for-workspace]').waitFor();
  assert(!report.requests.some((request) => request.path.endsWith('/bootstrap')));
  probe('real-login-waits-without-seed-bootstrap');
  const first = await session(page),
    id = first.body.data.authSession.id,
    user = first.body.data.user;
  assert.equal(first.status, 200);
  assert.equal(first.body.data.currentWorkspaceId, null);
  const cookie = (await context.cookies()).find((item) => item.name === 'task8_local_session');
  assert(cookie);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'Lax');
  assert.equal(cookie.expires, -1);
  assert.equal(
    await page.evaluate(() => globalThis.document.cookie.includes('task8_local_session=')),
    false,
  );
  report.cookieFlags = {
    name: cookie.name,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    persistent: false,
  };
  probe('session-cookie-is-HttpOnly-and-nonpersistent');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  assert(!stored.includes('correct-password'));
  assert(!stored.includes(cookie.value));
  probe('credentials-and-SID-absent-browser-storage');
  await sql('UPDATE authSessions SET accessExpiresAt=1 WHERE id=?', [id]);
  const beforeRefresh = provider.state.refreshCount;
  await page.goto(web + '/#home');
  await page.locator('[data-waiting-for-workspace]').waitFor();
  assert.equal(provider.state.refreshCount, beforeRefresh + 1);
  assert.equal((await session(page)).body.data.authSession.id, id);
  probe('expired-access-startup-refreshes-before-redirect');
  const fixture = seedRows(),
    workspaceId = fixture.primary.workspaceId,
    memberId = '01a11abd-aa80-7000-8000-000000000090';
  const grant = await localFetch(h.baseUrl + '/__auth/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      activeMemberGrant({
        memberId,
        workspaceId,
        userId: user.id,
        sourceMemberId: fixture.primary.memberId,
        now: Date.now(),
      }),
    ),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(grant.status, 200);
  await page.locator('#waiting-retry').click();
  await page.waitForURL('**/w/' + workspaceId + '/**');
  assert.equal((await session(page)).body.data.user.id, user.id);
  probe('waiting-retry-grant-enters-workspace-same-profile');
  await page.goto(web + '/w/' + workspaceId + '/settings/password');
  await page.locator('[data-settings-page=password][data-settings-ready]').waitFor();
  assert.equal(await page.locator('[data-settings-page=password] input').count(), 0);
  probe('HTTP-account-security-does-not-offer-demo-password-success');
  await page.goto(web + '/');
  await page.waitForURL('**/w/' + workspaceId + '/**');
  const tab = await context.newPage();
  await tab.goto(web + '/');
  await tab.waitForURL('**/w/' + workspaceId + '/**');
  await page.goto(web + '/login?returnTo=https%3A%2F%2Fforeign.invalid');
  await page.locator('#l-email').waitFor();
  await signIn(page);
  await page.waitForURL('**/w/' + workspaceId + '/**');
  assert.equal(new URL(page.url()).origin, web);
  probe('external-return-path-rejected');
  const oldSession = (await session(page)).body;
  await page.evaluate(async (value) => {
    const { createHttpClient } = await import('/src/data/adapters/http.ts');
    const { createHttpAuth } = await import('/src/data/auth.ts');
    const { createStudioQueryClient } = await import('/src/data/queries.ts');
    const { captureIntent } = await import('/src/data/operations.ts');
    const cache = createStudioQueryClient(),
      client = createHttpClient({ auth: () => auth }),
      auth = createHttpAuth(client);
    auth.connect(cache);
    cache.setQueryData(['session'], value);
    globalThis.__authAcceptance = { cache, client, auth, scope: captureIntent(client) };
  }, oldSession);
  let releaseRead, arrivedRead;
  const heldRead = new Promise((resolve) => (releaseRead = resolve)),
    readReady = new Promise((resolve) => (arrivedRead = resolve));
  await page.route('**/api/v1/me/profile', async (route) => {
    const response = await route.fetch();
    arrivedRead();
    await heldRead;
    try {
      await route.fulfill({ response });
    } catch (error) {
      if (!/closed|aborted|disposed/iu.test(String(error))) throw error;
    }
  });
  await page.evaluate(() => {
    globalThis.__authAcceptance.oldRead = globalThis.__authAcceptance.client
      .execute('getProfile', {})
      .then(
        () => 'accepted',
        (error) => error.detail?.code ?? error.name,
      );
  });
  await readReady;
  await tab.goto(web + '/login');
  await signIn(tab, 1);
  await tab.locator('[data-waiting-for-workspace]').waitFor();
  await page.locator('[data-waiting-for-workspace]').waitFor();
  assert.equal((await session(page)).body.data.user.email, provider.accounts[1].email);
  probe('BroadcastChannel-account-switch-resyncs-other-tab');
  const switched = (await session(page)).body;
  await page.evaluate(
    async (value) => globalThis.__authAcceptance.auth.observeSession(value),
    switched,
  );
  releaseRead();
  assert.equal(await page.evaluate(() => globalThis.__authAcceptance.oldRead), 'SESSION_CHANGED');
  await page.unroute('**/api/v1/me/profile');
  probe('inflight-old-profile-response-rejected-after-account-switch');
  const beforeFiles = (await sql('SELECT count(*) count FROM files'))[0].count;
  const stopped = await page.evaluate(
    async ({ workspaceId, projectId }) => {
      try {
        await globalThis.__authAcceptance.scope.execute('uploadProjectFile', {
          workspaceId,
          projectId,
          body: {
            clientRequestId: '11111111-1111-4111-8111-111111111111',
            file: {
              name: 'held.bin',
              mimeType: 'application/octet-stream',
              bytes: new Uint8Array([1]),
            },
          },
        });
        return 'accepted';
      } catch (error) {
        return error.detail?.code ?? error.name;
      }
    },
    { workspaceId, projectId: fixture.rows.projects[0].id },
  );
  assert.equal(stopped, 'SESSION_CHANGED');
  assert.equal((await sql('SELECT count(*) count FROM files'))[0].count, beforeFiles);
  probe('captured-old-upload-intent-has-zero-effects');
  const refreshBefore = provider.state.refreshCount;
  for (const operation of ['refresh', 'logout']) {
    const result = await page.evaluate(
      async ({ operation, expected }) => {
        const response = await fetch('/api/v1/auth/' + operation, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Task8-Session-Id': expected },
        });
        return { status: response.status, body: await response.json() };
      },
      { operation, expected: oldSession.data.authSession.id },
    );
    assert.equal(result.status, 409);
    assert.equal(result.body.error.code, 'SESSION_CHANGED');
  }
  assert.equal(provider.state.refreshCount, refreshBefore);
  assert.equal((await session(page)).status, 200);
  probe('stale-browser-refresh-and-logout-cannot-affect-current-account');
  await page.locator('#waiting-logout').click();
  await page.locator('#l-email').waitFor();
  await tab.locator('#l-email').waitFor();
  probe('logout-acknowledgement-resyncs-tabs');
  await page.goBack();
  await page.locator('#l-email').waitFor();
  assert.equal((await session(page)).status, 401);
  probe('back-button-does-not-reopen-revoked-session');
  await signIn(page, 1);
  await page.locator('[data-waiting-for-workspace]').waitFor();
  const persistent = (await context.cookies()).find((item) => item.name === 'task8_local_session');
  assert(persistent && persistent.expires > 0);
  probe('remember-device-cookie-has-bounded-expiry');
  await page.reload();
  await page.locator('[data-waiting-for-workspace]').waitFor();
  probe('remember-session-survives-reload');
  await context.close();
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await h.cleanup();
  await provider.close();
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.length,
      error: report.error ?? null,
      report: h.out + '/report.json',
    }),
  );
}
