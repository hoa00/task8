import { createIdentityProvider } from '/Users/hoadev/Projects/ai-v3/task8-react/apps/api/src/modules/auth/http/index.ts';
export default {
  async fetch() {
    const rows: object[] = [];
    try {
      const response = await fetch('https://hrm-api-v2.cwr.i24h.app/v1/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json', 'i24h-tenant': 'ict24h-rdn-dev' },
        body: '{}', redirect: 'manual', signal: AbortSignal.timeout(10000),
      });
      const body = await response.json() as { statusCode?: number; error?: unknown };
      rows.push({ probe: 'raw-empty-login', httpStatus: response.status, bodyStatus: body.statusCode, contentType: response.headers.get('content-type'), hasError: Object.hasOwn(body, 'error') });
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      rows.push({ probe: 'raw-empty-login', errorType: name, mentionsTls: /tls|ssl|certificate/.test(message), mentionsDns: /dns|resolve/.test(message), mentionsConnect: /connect|network|fetch/.test(message), timeout: /timeout|timed out/.test(message) });
    }
    const provider = createIdentityProvider({ baseUrl: 'https://hrm-api-v2.cwr.i24h.app', tenantId: 'ict24h-rdn-dev' }, { fetch, clock: { now: () => Date.now() } });
    try { await provider.login({ email: '', password: '' }); rows.push({ probe: 'production-adapter-empty-login', outcome: 'unexpected-success' }); }
    catch (error) { rows.push({ probe: 'production-adapter-empty-login', code: error && typeof error === 'object' && 'code' in error ? error.code : 'unknown' }); }
    const wrappedProvider = createIdentityProvider({ baseUrl: 'https://hrm-api-v2.cwr.i24h.app', tenantId: 'ict24h-rdn-dev' }, { fetch: async (input, init) => {
      try {
        const response = await fetch(input, init);
        const payload = await response.clone().json() as Record<string, unknown>;
        rows.push({ probe: 'wrapped-fetch', httpStatus: response.status, contentType: response.headers.get('content-type'), keys: Object.keys(payload), statusCode: payload.statusCode, messageType: typeof payload.message, messageArray: Array.isArray(payload.message), hasError: Object.hasOwn(payload, 'error') });
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        rows.push({ probe: 'wrapped-fetch-failure', illegalInvocation: message.includes('illegal invocation') }); throw error;
      }
    }, clock: { now: () => Date.now() } });
    try { await wrappedProvider.login({ email: '', password: '' }); rows.push({ probe: 'wrapped-adapter', outcome: 'unexpected-success' }); }
    catch (error) { rows.push({ probe: 'wrapped-adapter', code: error && typeof error === 'object' && 'code' in error ? error.code : 'unknown' }); }
    const deps = { fetch };
    try { const result = await deps.fetch('https://hrm-api-v2.cwr.i24h.app/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'i24h-tenant': 'ict24h-rdn-dev' }, body: '{"email":"","password":""}', redirect: 'manual' }); rows.push({ probe: 'method-native-fetch', status: result.status }); }
    catch (error) { const message = error instanceof Error ? error.message.toLowerCase() : ''; rows.push({ probe: 'method-native-fetch', illegalInvocation: message.includes('illegal invocation'), errorType: error instanceof Error ? error.name : 'unknown' }); }
    return Response.json({ runtime: 'workerd', rows });
  },
};
