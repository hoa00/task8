import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
export async function createControlledIdentityProvider() {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const tenant = 'ict24h-rdn-dev';
  const accounts = [
    { id: randomUUID(), srv_t: tenant, email: 'account-a@example.invalid', fullname: 'Hòa A' },
    { id: randomUUID(), srv_t: tenant, email: 'account-b@example.invalid', fullname: 'Hòa B' },
  ];
  const access = new Map(),
    refresh = new Map();
  const state = {
    accessTtlSeconds: 600,
    extraClaims: {},
    redirectLogin: false,
    loginUnavailable: false,
    refreshUnavailable: false,
    whoamiMissing: false,
    mismatch: false,
    omitProfileTenant: false,
    blockLogin: null,
    blockRefresh: null,
    refreshCount: 0,
  };
  const success = (data) => ({ statusCode: 200, message: 'success', data });
  const failure = (code) => ({
    statusCode: code,
    message: 'error',
    error: [{ message: 'controlled rejected credential' }],
  });
  function issue(profile) {
    const expires = Date.now() + state.accessTtlSeconds * 1000;
    const payload = {
      sub: profile.id,
      tenant: profile.srv_t,
      type: 'ACCESS_TOKEN',
      exp: Math.floor(expires / 1000),
      nonce: randomUUID(),
      ...state.extraClaims,
    };
    const input = [{ alg: 'RS256', typ: 'JWT' }, payload]
      .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
      .join('.');
    const token =
      input + '.' + sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url');
    const opaque = randomBytes(32).toString('base64url');
    access.set(token, profile);
    refresh.set(opaque, profile);
    return {
      access: { token, expires: new Date(expires).toISOString() },
      refresh: { token: opaque, expires: new Date(Date.now() + 20 * 86400000).toISOString() },
    };
  }
  function block() {
    let release, arrived;
    const ready = new Promise((resolve) => (arrived = resolve));
    const hold = new Promise((resolve) => (release = resolve));
    return { release, arrived, ready, hold };
  }
  function serializedProfile(profile) {
    const result = { ...profile };
    if (state.omitProfileTenant) delete result.srv_t;
    return result;
  }
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const bytes of req) body += bytes;
    const input = body ? JSON.parse(body) : {};
    let status = 201,
      result;
    if (req.url === '/v1/auth/login') {
      if (state.loginUnavailable) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify(failure(503)));
        return;
      }
      if (state.redirectLogin) {
        res.writeHead(302, { location: providerUrl + '/redirect-target' });
        res.end();
        return;
      }
      const controlled = state.blockLogin;
      state.blockLogin = null;
      if (controlled) {
        controlled.arrived();
        await controlled.hold;
      }
      const profile = accounts.find((account) => account.email === input.email);
      if (!profile || input.password !== 'correct-password') {
        status = 401;
        result = failure(401);
      } else result = success({ user: serializedProfile(profile), tokens: issue(profile) });
    } else if (req.url === '/v1/auth/refresh-token') {
      state.refreshCount++;
      const controlled = state.blockRefresh;
      state.blockRefresh = null;
      if (controlled) {
        controlled.arrived();
        await controlled.hold;
        if (controlled.reject) {
          status = 401;
          result = failure(401);
        }
      }
      if (!result) {
        const profile = refresh.get(input.refreshToken);
        if (state.refreshUnavailable) {
          status = 503;
          result = failure(503);
        } else if (!profile) {
          status = 401;
          result = failure(401);
        } else result = success(issue(state.mismatch ? accounts[1] : profile));
      }
    } else if (req.url === '/v1/user/whoami') {
      status = 200;
      const profile = access.get(String(req.headers.authorization ?? '').slice(7));
      if (state.whoamiMissing || !profile) {
        status = 404;
        result = failure(404);
      } else result = success(serializedProfile(profile));
    } else {
      status = 404;
      result = failure(404);
    }
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const providerUrl = 'http://127.0.0.1:' + upstream.address().port;
  const secret = randomBytes(32).toString('base64url');
  return {
    publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    secret,
    providerUrl,
    accounts,
    tenant,
    state,
    block,
    issue,
    credentials: () => [...access.keys(), ...refresh.keys()],
    close: () => new Promise((resolve) => upstream.close(resolve)),
  };
}
