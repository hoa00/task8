import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createHarness, localFetch } from '../support/harness.mjs';

const report = { status: 'RUNNING', commands: [], probes: [] };
const harness = await createHarness('auth-provider', report);
const tenant = 'ict24h-rdn-dev';
const subject = '11111111-1111-4111-8111-111111111111';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const foreign = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = Math.floor(Date.now() / 1000);
const claims = { sub: subject, tenant, type: 'ACCESS_TOKEN', exp: now + 600 };
function token(payload, privateKey = keys.privateKey, algorithm = 'RS256') {
  const input = [JSON.stringify({ alg: algorithm, typ: 'JWT' }), JSON.stringify(payload)]
    .map((part) => Buffer.from(part).toString('base64url'))
    .join('.');
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
}
async function request(name, path, status, init = {}) {
  const response = await localFetch(harness.baseUrl + path, {
    ...init,
    signal: AbortSignal.timeout(30000),
  });
  report.probes.push({ name, status: response.status });
  assert.equal(response.status, status, name);
  return response;
}
try {
  await harness.start('fresh-rsa', {
    TEST_PUBLIC_KEY: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    TEST_TENANT: tenant,
  });
  await request('actual-worker', '/health', 200);
  await request('UserAuthInfo-HTTPException', '/missing-context', 401);
  for (const [name, payload, key, algorithm] of [
    ['valid', claims, keys.privateKey, 'RS256'],
    ['invalid-signature', claims, foreign.privateKey, 'RS256'],
    ['wrong-tenant', { ...claims, tenant: 'another-tenant' }, keys.privateKey, 'RS256'],
    ['wrong-type', { ...claims, type: 'REFRESH_TOKEN' }, keys.privateKey, 'RS256'],
    ['expired', { ...claims, exp: now - 1 }, keys.privateKey, 'RS256'],
    ['missing-exp', { sub: subject, tenant, type: 'ACCESS_TOKEN' }, keys.privateKey, 'RS256'],
    ['noninteger-exp', { ...claims, exp: now + 600.5 }, keys.privateKey, 'RS256'],
    ['missing-sub', { tenant, type: 'ACCESS_TOKEN', exp: now + 600 }, keys.privateKey, 'RS256'],
    ['wrong-algorithm', claims, keys.privateKey, 'HS256'],
  ]) {
    const value = token(payload, key, algorithm);
    const rawStatus = ['valid', 'missing-exp', 'noninteger-exp'].includes(name) ? 200 : 401;
    const raw = await request('library-' + name, '/raw', rawStatus, {
      headers: { authorization: 'Bearer ' + value },
    });
    if (rawStatus === 200)
      assert.deepEqual(await raw.json(), { userId: subject, tenantId: tenant });
    const bridge = await request(
      'bridge-' + name,
      '/bridge/identity',
      name === 'valid' ? 200 : 401,
      { headers: { 'X-Test-Token': value } },
    );
    if (name === 'valid')
      assert.deepEqual(await bridge.json(), { userId: subject, tenantId: tenant });
    else assert.deepEqual(await bridge.json(), { error: 'UNAUTHENTICATED' });
  }
  await request('missing-Bearer', '/raw', 401);
  await request('malformed-token', '/bridge/identity', 401, {
    headers: { 'X-Test-Token': 'not-a-token' },
  });
  await request('browser-Bearer-is-not-bridge-identity', '/bridge/identity', 401, {
    headers: { authorization: 'Bearer ' + token(claims) },
  });
  const headers = { 'X-Test-Token': token(claims), authorization: 'Bearer browser-untrusted' };
  const body = { preserved: 'Unicode tiếng Việt', nested: { value: 123 } };
  const json = await request('unchanged-json-stream', '/bridge/json', 200, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.deepEqual(await json.json(), body);
  const bytes = new Uint8Array([0, 255, 1, 13, 10, 128]);
  const form = new FormData();
  form.set('name', 'Tiếng Việt');
  form.set('file', new File([bytes], 'proof.bin', { type: 'application/octet-stream' }));
  const multipart = await request('unchanged-multipart-stream', '/bridge/multipart', 200, {
    method: 'POST',
    headers,
    body: form,
  });
  assert.deepEqual(await multipart.json(), {
    name: 'Tiếng Việt',
    file: 'proof.bin',
    bytes: [...bytes],
  });
  const binary = await request('unchanged-byte-endpoint', '/bridge/bytes', 200, {
    method: 'POST',
    headers,
    body: bytes,
  });
  assert.deepEqual(new Uint8Array(await binary.arrayBuffer()), bytes);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await harness.cleanup();
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.length,
      error: report.error ?? null,
      report: harness.out + '/report.json',
    }),
  );
}
