/* global document, window, innerWidth */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';

export async function runWebCases(x) {
  const {
    root,
    dir,
    origin,
    issuer,
    report,
    check,
    app,
    sql,
    task8,
    owner,
    budget,
    client,
    operator,
    credentials,
    fixture,
    businessSnapshot,
    hash,
  } = x;
  const request = async (
    path,
    { cookie = '', worker = 'task8-main', method = 'GET', headers = {}, body } = {},
  ) =>
    (await task8.getWorker(worker)).fetch(
      new Request(origin + path, {
        redirect: 'manual',
        method,
        headers: { ...(cookie ? { cookie } : {}), ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const cookiePart = (response, name) =>
    response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .find((v) => v.startsWith(name + '='));
  const sessionCookie = '__Host-task8_oidc_session',
    loginCookie = '__Host-task8_oidc_login';
  const sessionCount = async () =>
    Number((await sql('SELECT count(*) n FROM oidcAppSessions'))[0].n);
  async function begin(prior = '') {
    await budget(2);
    const response = await request('/auth/login?returnTo=/', { cookie: prior });
    assert.equal(response.status, 303);
    const url = new URL(response.headers.get('location')),
      binding = cookiePart(response, loginCookie);
    assert(binding);
    assert.equal(url.searchParams.get('client_id'), client.client_id);
    return {
      url,
      binding,
      state: url.searchParams.get('state'),
      cookie: [binding, prior].filter(Boolean).join('; '),
    };
  }
  async function authorize(tx, alter = () => {}) {
    const url = new URL(tx.url);
    alter(url);
    const response = await fetch(url, {
      headers: { cookie: x.providerCookie() },
      redirect: 'manual',
    });
    const value =
      response.headers.get('location') ?? (response.ok ? (await response.json()).url : null);
    assert.equal(response.status >= 400, false);
    assert(value);
    return new URL(value);
  }
  const callback = (url, tx, options = {}) =>
    request('/auth/callback' + url.search, { cookie: tx.cookie, ...options });
  async function successful() {
    const tx = await begin(),
      url = await authorize(tx),
      response = await callback(url, tx);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    const cookie = cookiePart(response, sessionCookie);
    assert(cookie);
    return { tx, url, response, cookie, sid: cookie.slice(cookie.indexOf('=') + 1) };
  }
  await check('browser-public-mode-independent-of-session', async () => {
    assert.equal((await app('/api/v1/session')).status, 401);
    const response = await app('/api/v1/auth-metadata');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { mode: 'oidc', csrf: null });
    return { metadata: 200, anonymousSession: 401 };
  });
  await check('browser-return-path-and-config-injection-rejected', async () => {
    const before = await sql('SELECT count(*) n FROM oidcLoginTransactions');
    for (const value of [
      'https://foreign.invalid',
      '//foreign.invalid',
      '/auth/callback',
      '/login',
      '/%2f%2fhost',
      '/w/a\\b',
      '/\n',
      '/w/../auth/callback',
    ]) {
      assert.equal(
        (await request('/auth/login?' + new URLSearchParams({ returnTo: value }))).status,
        400,
      );
    }
    for (const query of [
      'client_id=foreign',
      'issuer=https://foreign.invalid',
      'redirect_uri=https://foreign.invalid',
      'returnTo=/&returnTo=/',
    ])
      assert.equal((await request('/auth/login?' + query)).status, 400);
    assert.deepEqual(await sql('SELECT count(*) n FROM oidcLoginTransactions'), before);
    return { denied: 12, transactionsCreated: 0 };
  });
  await check('browser-binding-state-duplicates-expiry-and-one-use', async () => {
    const before = await sessionCount(),
      tx = await begin(),
      url = await authorize(tx);
    const row = () =>
      sql('SELECT status FROM oidcLoginTransactions WHERE stateHash=?', [hash(tx.state)]);
    const wrong = await callback(url, tx, {
      cookie: loginCookie + '=' + randomBytes(32).toString('base64url'),
    });
    assert.match(wrong.headers.get('location'), /authError=transaction/);
    assert.equal((await row())[0].status, 'pending');
    const duplicate = new URL(url);
    duplicate.searchParams.append('state', tx.state);
    assert.match((await callback(duplicate, tx)).headers.get('location'), /authError=transaction/);
    const missing = new URL(url);
    missing.searchParams.delete('state');
    assert.match((await callback(missing, tx)).headers.get('location'), /authError=transaction/);
    const forged = new URL(url);
    forged.searchParams.set('state', randomBytes(32).toString('base64url'));
    assert.match((await callback(forged, tx)).headers.get('location'), /authError=transaction/);
    assert.equal((await row())[0].status, 'pending');
    const result = await callback(url, tx);
    assert.equal(result.headers.get('location'), '/');
    assert.equal(await sessionCount(), before + 1);
    assert.match((await callback(url, tx)).headers.get('location'), /authError=transaction/);
    const exp = await begin(),
      expUrl = await authorize(exp);
    await sql(
      'UPDATE oidcLoginTransactions SET createdAt=createdAt-600001,expiresAt=expiresAt-600001 WHERE stateHash=?',
      [hash(exp.state)],
    );
    const calls = x.tokenCalls();
    assert.match((await callback(expUrl, exp)).headers.get('location'), /authError=transaction/);
    assert.equal(x.tokenCalls(), calls);
    return {
      wrongBindingPreservesPending: true,
      duplicateAndMissingStateDenied: true,
      replayDenied: true,
      expiredDeniedBeforeExchange: true,
      sessionsCreated: 1,
    };
  });
  await check(
    'browser-native-nonce-verifier-client-redirect-and-suite-code-negatives',
    async () => {
      const before = await sessionCount();
      for (const kind of ['nonce', 'verifier']) {
        const tx = await begin(),
          url = await authorize(tx, (url) =>
            url.searchParams.set(
              kind === 'nonce' ? 'nonce' : 'code_challenge',
              randomBytes(32).toString('base64url'),
            ),
          );
        assert.match((await callback(url, tx)).headers.get('location'), /authError=transaction/);
      }
      const suite = await operator.registerClient({
        index: 0,
        operatorEmail: credentials.operatorEmail,
        operatorPassword: credentials.operatorPassword,
      });
      const tx = await begin(),
        url = await authorize(tx, (url) => {
          url.searchParams.set('client_id', suite.client_id);
          url.searchParams.set('redirect_uri', 'https://work-management-suite.demo/auth/callback');
        });
      assert.equal(url.origin, 'https://work-management-suite.demo');
      assert.match((await callback(url, tx)).headers.get('location'), /authError=transaction/);
      const redirect = await begin(),
        bad = new URL(redirect.url);
      bad.searchParams.set('redirect_uri', origin + '/auth/not-registered');
      const rejected = await fetch(bad, {
        headers: { cookie: x.providerCookie() },
        redirect: 'manual',
      });
      // Native provider returns its fixed error page as JSON for fetch/cors requests.
      assert([200, 302].includes(rejected.status));
      const errorTarget = new URL(rejected.headers.get('location') ?? (await rejected.json()).url);
      assert.equal(errorTarget.origin, new URL(issuer).origin);
      assert.equal(errorTarget.pathname, new URL(issuer).pathname + '/error');
      assert.equal(errorTarget.searchParams.get('error'), 'invalid_redirect');
      assert.equal(errorTarget.searchParams.has('code'), false);
      assert.notEqual(errorTarget.href, bad.searchParams.get('redirect_uri'));
      assert.equal(await sessionCount(), before);
      return {
        nativeSignedNonceMismatch: true,
        wrongPkceVerifier: true,
        codeIssuedToSuiteRejected: true,
        unregisteredRedirectStatus: rejected.status,
        sessionsCreated: 0,
      };
    },
  );
  await check('browser-callback-race-one-exchange-and-new-session-fixation', async () => {
    const before = await sessionCount(),
      tx = await begin(),
      url = await authorize(tx),
      calls = x.tokenCalls();
    const responses = await Promise.all([
      callback(url, tx),
      callback(url, tx, { worker: 'task8-peer' }),
    ]);
    assert.equal(responses.filter((r) => r.headers.get('location') === '/').length, 1);
    assert.equal(x.tokenCalls() - calls, 1);
    assert.equal(await sessionCount(), before + 1);
    const winner = responses.find((r) => r.headers.get('location') === '/'),
      cookie = cookiePart(winner, sessionCookie);
    assert(cookie);
    assert.notEqual(cookie.split('=')[1], tx.binding.split('=')[1]);
    assert.equal((await request('/auth/login', { cookie })).status, 400);
    return {
      callbacks: 2,
      winners: 1,
      exchanges: 1,
      sessionsCreated: 1,
      newOpaqueSid: true,
      activeAccountSwapDenied: true,
    };
  });
  await check('browser-two-tabs-latest-binding-and-lost-token-response-terminal', async () => {
    const first = await begin(),
      second = await begin(),
      firstUrl = await authorize(first),
      secondUrl = await authorize(second);
    assert.match(
      (await callback(firstUrl, first, { cookie: second.cookie })).headers.get('location'),
      /authError=transaction/,
    );
    assert.equal(
      (
        await sql('SELECT status FROM oidcLoginTransactions WHERE stateHash=?', [
          hash(second.state),
        ])
      )[0].status,
      'pending',
    );
    assert.equal((await callback(secondUrl, second)).headers.get('location'), '/');
    const before = await sessionCount(),
      lost = await begin(),
      lostUrl = await authorize(lost);
    x.setFault('lost-response');
    try {
      assert.match(
        (await callback(lostUrl, lost)).headers.get('location'),
        /authError=unavailable/,
      );
    } finally {
      x.setFault('');
    }
    assert.equal(
      (
        await sql('SELECT status FROM oidcLoginTransactions WHERE stateHash=?', [hash(lost.state)])
      )[0].status,
      'failed',
    );
    const calls = x.tokenCalls();
    assert.match((await callback(lostUrl, lost)).headers.get('location'), /authError=transaction/);
    assert.equal(x.tokenCalls(), calls);
    assert.equal(await sessionCount(), before);
    return {
      latestBindingWins: true,
      wrongTabDoesNotConsumeLatest: true,
      uncertainCodeNeverRetried: true,
      lostResponseNewSessions: 0,
    };
  });
  await check('browser-atomic-login-sql-zero-has-no-session-or-prior-effects', async () => {
    const prior = await successful();
    await sql(
      'UPDATE oidcAppSessions SET createdAt=createdAt-28800001,expiresAt=expiresAt-28800001 WHERE sidHash=?',
      [hash(prior.sid)],
    );
    const [priorBefore] = await sql(
      'SELECT revision,revokedAt FROM oidcAppSessions WHERE sidHash=?',
      [hash(prior.sid)],
    );
    assert.equal(priorBefore.revokedAt, null);
    const before = await sessionCount(),
      tx = await begin(prior.cookie),
      url = await authorize(tx),
      wait = x.barrier();
    x.setBarrier({ ...wait, network: true });
    const pending = callback(url, tx);
    void pending.catch(() => {});
    try {
      await x.waitFor(wait.reached);
      await sql(
        'UPDATE oidcLoginTransactions SET createdAt=createdAt-600001,expiresAt=expiresAt-600001 WHERE stateHash=?',
        [hash(tx.state)],
      );
      wait.release();
      const response = await pending;
      assert.match(response.headers.get('location'), /authError=transaction/);
    } finally {
      wait.release();
      x.setBarrier(null);
    }
    assert.equal(await sessionCount(), before);
    assert.deepEqual(
      (
        await sql('SELECT revision,revokedAt FROM oidcAppSessions WHERE sidHash=?', [
          hash(prior.sid),
        ])
      )[0],
      priorBefore,
    );
    const [row] = await sql('SELECT status,secret FROM oidcLoginTransactions WHERE stateHash=?', [
      hash(tx.state),
    ]);
    assert.equal(row.status, 'failed');
    assert.equal(row.secret, '');
    const next = await begin(prior.cookie),
      nextUrl = await authorize(next),
      winner = await callback(nextUrl, next);
    assert.equal(winner.headers.get('location'), '/');
    assert.notEqual(cookiePart(winner, sessionCookie), prior.cookie);
    const [priorAfter] = await sql(
      'SELECT revision,revokedAt FROM oidcAppSessions WHERE sidHash=?',
      [hash(prior.sid)],
    );
    assert.equal(priorAfter.revision, priorBefore.revision + 1);
    assert(priorAfter.revokedAt !== null);
    return {
      clock: 'controlled D1 expiry during real token exchange',
      sqlZeroNewSessions: 0,
      sqlZeroPriorEffects: 0,
      terminal: 'failed',
      secretsCleared: true,
      winningReplacementRevokesExpiredPrior: true,
    };
  });
  await check('browser-cookie-mutations-require-exact-origin-and-session-csrf', async () => {
    const login = await successful(),
      session = await request('/api/v1/session', { cookie: login.cookie }),
      data = (await session.json()).data;
    const context = await request('/auth/context', { cookie: login.cookie }),
      proof = (await context.json()).csrf;
    assert(proof);
    const path =
      '/api/v1/workspaces/' +
      fixture.primary.workspaceId +
      '/notifications/' +
      fixture.rows.notifications[0].id;
    const before = await businessSnapshot();
    for (const headers of [
      { origin, 'X-Task8-Session-Id': data.authSession.id },
      { origin, 'X-Task8-Session-Id': data.authSession.id, 'X-CSRF-Token': 'wrong' },
      {
        origin: 'https://foreign.invalid',
        'X-Task8-Session-Id': data.authSession.id,
        'X-CSRF-Token': proof,
      },
      { 'X-Task8-Session-Id': data.authSession.id, 'X-CSRF-Token': proof },
    ])
      assert.equal(
        (
          await request(path, {
            cookie: login.cookie,
            method: 'PATCH',
            headers: { ...headers, 'content-type': 'application/json' },
            body: { read: true },
          })
        ).status,
        403,
      );
    assert.deepEqual(await businessSnapshot(), before);
    for (const name of ['__Host-task8_session', '__Host-suite_session'])
      assert.equal(
        (await request('/api/v1/session', { cookie: name + '=' + login.sid })).status,
        401,
      );
    return { unsafeRejected: 4, zeroBusinessEffects: true, foreignCookieNamespacesDenied: true };
  });
  assert.deepEqual(
    await businessSnapshot(),
    report.businessBefore,
    'authentication must not rewrite business data',
  );
  report.authOnlyBusinessPreserved = true;

  const require = createRequire(resolve(root, 'package.json')),
    { chromium } = require('@playwright/test');
  let vite,
    browser,
    context,
    stopped = false;
  const viteLog = [];
  const stopVite = async () => {
    if (!vite || stopped) return;
    stopped = true;
    if (vite.exitCode === null) {
      vite.kill('SIGTERM');
      await x.waitFor(once(vite, 'exit'));
    }
    report.browserProcesses.vite.exitCode = vite.exitCode;
    report.browserProcesses.vite.signal = vite.signalCode;
  };
  try {
    await mkdir(resolve(dir, 'browser'), { recursive: true, mode: 0o700 });
    const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
    vite = spawn(
      process.execPath,
      [
        resolve(webRequire.resolve('vite/package.json'), '../bin/vite.js'),
        '--host',
        '127.0.0.1',
        '--port',
        '4317',
        '--strictPort',
      ],
      {
        cwd: resolve(root, 'apps/web'),
        env: {
          ...process.env,
          TASK8_ISOLATED_PROFILE: '1',
          VITE_DATA_MODE: 'http',
          TASK8_API_PROXY_TARGET: 'http://127.0.0.1:4316',
          PORTLESS_URL: origin,
          __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: 'datamaker-task.demo',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    vite.stdout.on('data', (b) => viteLog.push(b));
    vite.stderr.on('data', (b) => viteLog.push(b));
    report.browserProcesses = {
      vite: {
        pid: vite.pid,
        command: 'Node24 Vite --host127.0.0.1 --port4317 --strictPort',
        port: 4317,
        worktree: root,
      },
      browser: {},
    };
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (vite.exitCode !== null) break;
      try {
        ready = (await fetch('http://127.0.0.1:4317/')).ok;
        if (ready) break;
      } catch {
        /* Listener may not be ready yet. */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    assert(ready, 'actual Vite ready');
    await owner.add('datamaker-task', 4317);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    report.browser = {
      name: 'Chrome',
      version: browser.version(),
      httpsErrorsIgnored: false,
      origin,
    };
    await x.captureProcesses();
    context = await browser.newContext();
    const page = await context.newPage(),
      network = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === origin) network.push({ method: request.method(), path: url.pathname });
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.name));
    await check('browser-real-chrome-oidc-login-reload-host-cookie-and-keyboard', async () => {
      await budget(3);
      await page.goto(origin + '/login');
      await page.locator('#identity-login').waitFor();
      assert.equal(await page.locator('input[type=password]').count(), 0);
      await page.locator('#identity-login').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL((url) => url.origin === new URL(issuer).origin);
      await page.getByLabel('Email', { exact: true }).fill(credentials.email);
      await page.getByLabel('Mật khẩu', { exact: true }).fill(credentials.password);
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.waitForURL((url) => url.origin === origin && url.pathname.startsWith('/w/'), {
        timeout: 30000,
      });
      await page.reload();
      await page.waitForURL((url) => url.pathname.startsWith('/w/'));
      const response = await context.request.get(origin + '/api/v1/session');
      assert.equal(response.status(), 200);
      const data = (await response.json()).data;
      assert.equal(data.user.id, fixture.primary.userId);
      assert.equal(data.capabilities.identityMode, 'oidc');
      const cookies = await context.cookies(origin),
        owned = cookies.find((c) => c.name === sessionCookie);
      assert(owned);
      assert(owned.httpOnly && owned.secure);
      assert.equal(owned.domain, 'datamaker-task.demo');
      assert.equal(owned.path, '/');
      assert.equal(owned.sameSite, 'Lax');
      assert(!(await context.cookies(issuer)).some((c) => c.name === sessionCookie));
      assert(owned.expires - Date.now() / 1000 <= 28800);
      assert(!(await page.evaluate(() => document.cookie)).includes(sessionCookie));
      assert.equal(
        await page.evaluate(() =>
          Object.values(localStorage).some((value) =>
            /access_token|refresh_token|id_token/.test(value),
          ),
        ),
        false,
      );
      assert(
        !new URL(page.url()).searchParams.has('code') &&
          !new URL(page.url()).searchParams.has('state'),
      );
      assert(
        !network.some(
          (r) =>
            r.method === 'POST' && ['/api/v1/auth/login', '/api/v1/auth/refresh'].includes(r.path),
        ),
      );
      assert.equal(await page.evaluate(() => window.isSecureContext), true);
      report.browserSessionId = data.authSession.id;
      return {
        userId: data.user.id,
        reload: 200,
        secureContext: true,
        hostOnly: true,
        httpOnly: true,
        sameSite: 'Lax',
        legacyCalls: 0,
        keyboardEnter: true,
      };
    });
    await check('browser-real-chrome-responsive-light-dark-login', async () => {
      const publicPage = await context.newPage();
      await publicPage.goto(origin + '/login');
      await publicPage.locator('#identity-login').waitFor();
      const views = [];
      for (const width of [1440, 390])
        for (const dark of [false, true]) {
          await publicPage.setViewportSize({ width, height: 900 });
          await publicPage.emulateMedia({
            colorScheme: dark ? 'dark' : 'light',
            reducedMotion: 'reduce',
          });
          await publicPage.evaluate((dark) => {
            document.documentElement.classList.toggle('dark', dark);
            document.documentElement.dataset.theme = dark ? 'dark' : 'light';
          }, dark);
          const overflow = await publicPage.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          );
          assert.equal(overflow, false);
          const image = resolve(
            dir,
            'browser',
            `task8-login-${width}-${dark ? 'dark' : 'light'}.png`,
          );
          await publicPage.screenshot({ path: image, animations: 'disabled' });
          views.push({ width, dark, overflow: false, image });
        }
      await publicPage.close();
      return { views };
    });
    await check(
      'browser-real-chrome-unlinked-identity-is403-with-no-provision-or-password-fallback',
      async () => {
        const input = {
          email: 'task8-unlinked@identity.invalid',
          name: 'Unlinked Identity Fixture',
          password: randomBytes(24).toString('base64url'),
          role: 'user',
        };
        await writeFile(resolve(dir, 'browser-unlinked-input.json'), JSON.stringify(input), {
          mode: 0o600,
        });
        await operator.bootstrap(input);
        const before = await businessSnapshot(),
          unknown = await browser.newContext(),
          unlinked = await unknown.newPage();
        try {
          await budget(3);
          await unlinked.goto(origin + '/login');
          await unlinked.locator('#identity-login').click();
          await unlinked.getByLabel('Email', { exact: true }).fill(input.email);
          await unlinked.getByLabel('Mật khẩu', { exact: true }).fill(input.password);
          await unlinked.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
          await unlinked.waitForURL(
            (url) =>
              url.origin === origin &&
              url.pathname === '/login' &&
              url.searchParams.get('authError') === 'unlinked',
          );
          await unlinked.getByRole('alert').waitFor();
          assert.equal(await unlinked.locator('input[type=password]').count(), 0);
          assert.equal((await unknown.request.get(origin + '/api/v1/session')).status(), 401);
          assert.deepEqual(await businessSnapshot(), before);
          return {
            callbackLanding: 'unlinked',
            errorRole: 'alert',
            newLocalUsers: 0,
            newMembers: 0,
            legacyPasswordForm: false,
          };
        } finally {
          await unknown.close();
        }
      },
    );
    await check('browser-task-create-read-update-and-existing-identities-preserved', async () => {
      const preTasks = await sql('SELECT * FROM tasks ORDER BY id'),
        preMembers = await sql('SELECT * FROM workspaceMembers ORDER BY id'),
        preUsers = await sql('SELECT * FROM users ORDER BY id'),
        preHistory = await sql('SELECT * FROM activity ORDER BY id');
      const response = await context.request.get(origin + '/api/v1/session'),
        session = (await response.json()).data;
      const proof = (await (await context.request.get(origin + '/auth/context')).json()).csrf;
      const headers = {
        'X-CSRF-Token': proof,
        'X-Task8-Session-Id': session.authSession.id,
        Origin: origin,
      };
      const accessible =
          fixture.rows.projects.find((p) => p.visibility === 'workspace') ??
          fixture.rows.projects[0],
        base = '/api/v1/workspaces/' + fixture.primary.workspaceId;
      const created = await context.request.post(origin + base + '/tasks', {
        headers,
        data: {
          clientRequestId: crypto.randomUUID(),
          projectId: accessible.id,
          title: 'OIDC lifecycle proof',
          assigneeId: fixture.primary.memberId,
        },
      });
      assert.equal(created.status(), 201);
      const task = (await created.json()).data.task;
      assert(task);
      const read = await context.request.get(origin + base + '/tasks/' + task.id);
      assert.equal(read.status(), 200);
      const updated = await context.request.patch(origin + base + '/tasks/' + task.id, {
        headers,
        data: { expectedVersion: task.version, title: 'OIDC lifecycle proof updated' },
      });
      assert.equal(updated.status(), 200);
      const after = (await updated.json()).data.task;
      assert.equal(after.id, task.id);
      assert.equal(after.assigneeId, fixture.primary.memberId);
      assert.equal(after.version, task.version + 1);
      assert.deepEqual(
        await sql('SELECT * FROM tasks WHERE id<>? ORDER BY id', [task.id]),
        preTasks,
      );
      assert.deepEqual(await sql('SELECT * FROM workspaceMembers ORDER BY id'), preMembers);
      assert.deepEqual(await sql('SELECT * FROM users ORDER BY id'), preUsers);
      const oldHistory = new Set(preHistory.map((row) => row.id));
      assert.deepEqual(
        (await sql('SELECT * FROM activity ORDER BY id')).filter((row) => oldHistory.has(row.id)),
        preHistory,
      );
      const memberships = await context.request.get(origin + '/api/v1/workspaces');
      assert.equal(memberships.status(), 200);
      const list = (await memberships.json()).data;
      assert(list.length >= 2);
      const primaryBootstrap = await context.request.get(origin + base + '/bootstrap');
      assert.equal(primaryBootstrap.status(), 200);
      assert.equal((await primaryBootstrap.json()).data.currentMember.id, fixture.primary.memberId);
      const secondaryBootstrap = await context.request.get(
        origin + '/api/v1/workspaces/' + fixture.isolation.workspaceId + '/bootstrap',
      );
      assert.equal(secondaryBootstrap.status(), 200);
      assert.equal(
        (await secondaryBootstrap.json()).data.currentMember.id,
        fixture.isolation.memberId,
      );
      await page.goto(origin + '/w/' + fixture.primary.workspaceId + '/home');
      await page.getByRole('button', { name: 'Hồ sơ', exact: true }).waitFor();
      const restricted = fixture.rows.projects.find((p) => p.visibility === 'private');
      assert(restricted);
      assert.equal(
        (await context.request.get(origin + base + '/projects/' + restricted.id)).status(),
        403,
      );
      report.normalTaskCommand = {
        id: task.id,
        createdVersion: task.version,
        updatedVersion: after.version,
        assigneeId: after.assigneeId,
      };
      return {
        created: 201,
        read: 200,
        updated: 200,
        preexistingTasks: preTasks.length,
        preexistingIdentitiesPreserved: true,
        multiWorkspace: list.length,
        privateProjectChecked: !!restricted,
        normalTaskCommand: report.normalTaskCommand,
      };
    });
    const businessExpected = await businessSnapshot();
    await check('browser-local-logout-stale-upstream-outage-and-no-legacy-fallback', async () => {
      await sql(
        'UPDATE oidcAppSessions SET authorityValidatedAt=authorityValidatedAt-300001 WHERE id=?',
        [report.browserSessionId],
      );
      x.setFault('outage');
      try {
        assert.equal((await context.request.get(origin + '/api/v1/session')).status(), 503);
        await page.goto(origin + '/login');
        await page.locator('#identity-local-logout').waitFor();
        await page.locator('#identity-local-logout').click();
        await page.waitForURL(origin + '/login');
        await page.locator('#identity-local-logout').waitFor({ state: 'hidden' });
        assert.equal((await context.request.get(origin + '/api/v1/session')).status(), 401);
        await page.locator('#identity-login').click();
        await page.waitForURL(
          (url) => url.pathname === '/login' && url.searchParams.get('authError') === 'unavailable',
        );
        await page.getByRole('alert').waitFor();
        assert.equal(await page.locator('#identity-login').innerText(), 'Thử lại');
        assert.equal(await page.locator('input[type=password]').count(), 0);
        assert.equal((await context.request.get(origin + '/api/v1/auth-metadata')).status(), 200);
      } finally {
        x.setFault('');
      }
      await page.goto(origin + '/login');
      await page.locator('#identity-login').waitFor();
      assert.equal(await page.locator('input[type=password]').count(), 0);
      assert(
        !network.some(
          (r) =>
            r.method === 'POST' && ['/api/v1/auth/login', '/api/v1/auth/refresh'].includes(r.path),
        ),
      );
      return {
        stale: 503,
        contextAvailable: true,
        localLogout: 200,
        afterLogout: 401,
        legacyFallbackCalls: 0,
        realBeginUnavailableLanding: true,
        explicitRetryButton: true,
      };
    });
    await check('browser-native-provider-logout-confirm-state-and-token-free-return', async () => {
      await budget(3);
      await page.locator('#identity-login').click();
      await page.waitForURL((url) => url.origin === origin && url.pathname.startsWith('/w/'), {
        timeout: 30000,
      });
      const chooseIdentity = async () => {
        await page.getByRole('button', { name: 'Hồ sơ', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click();
        await page.getByRole('dialog', { name: 'Đăng xuất', exact: true }).waitFor();
        await page
          .getByRole('button', { name: 'Đăng xuất tài khoản Identity', exact: true })
          .focus();
        await page.keyboard.press('Enter');
        await page.waitForURL(
          (url) =>
            url.origin === new URL(issuer).origin && url.pathname.endsWith('/oauth2/end-session'),
        );
        assert(!new URL(page.url()).searchParams.has('id_token_hint'));
      };
      await chooseIdentity();
      assert.equal((await context.request.get(origin + '/api/v1/session')).status(), 401);
      assert.equal(await page.getByRole('button', { name: /Cancel|Retry/ }).count(), 0);
      await page.goBack();
      await page.goto(origin + '/login');
      await page.locator('#identity-login').waitFor();
      assert((await (await context.request.get(issuer + '/get-session')).json())?.session);
      await page.locator('#identity-login').click();
      await page.waitForURL((url) => url.origin === origin && url.pathname.startsWith('/w/'), {
        timeout: 30000,
      });
      let returnedState = null,
        returnReferer = false;
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin === origin && url.pathname === '/auth/logged-out') {
          returnedState = url.searchParams.get('state');
          returnReferer = !!request.headers().referer;
        }
      });
      await chooseIdentity();
      assert(!new URL(page.url()).searchParams.has('id_token_hint'));
      assert.equal((await context.request.get(origin + '/api/v1/session')).status(), 401);
      await page.getByRole('button', { name: 'Confirm logout', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(origin + '/login');
      assert(returnedState);
      assert.equal(returnReferer, false);
      const replay = await context.request.get(
        origin + '/auth/logged-out?' + new URLSearchParams({ state: returnedState }),
        { maxRedirects: 0 },
      );
      assert.equal(replay.status(), 400);
      const idp = await context.request.get(issuer + '/get-session');
      assert.equal(idp.status(), 200);
      assert.equal((await idp.json())?.session ?? null, null);
      return {
        actualTask8LogoutChoiceUi: true,
        retryRecoveredAfterUpstreamRestored: true,
        localRevokedBeforeConfirm: true,
        backAbandonsOnlyProviderStep: true,
        nativeConfirmationKeyboard: true,
        returnStateOnce: true,
        noHint: true,
        crossOriginReferer: false,
        idpSessionEnded: true,
      };
    });
    assert.deepEqual(
      await businessSnapshot(),
      businessExpected,
      'logout and authority changes must not rewrite domain',
    );
    assert.equal(errors.length, 0);
    report.browserNetwork = network;
    return businessExpected;
  } finally {
    await context?.close();
    await browser?.close();
    if (vite) {
      await stopVite();
      await writeFile(resolve(dir, 'browser', 'vite.log'), Buffer.concat(viteLog), { mode: 0o600 });
    }
  }
}
