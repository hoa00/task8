import { I24HTokenAuthGuard, UserAuthInfo, type I24HEnv } from '@hoa00/i24h-auth-honojs';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createAccessVerifier } from '../../src/modules/auth/http/index.ts';
import { ApiFailure } from '../../src/shared/errors.ts';
import { serverClock } from '../../src/shared/clock.ts';

interface ProofBindings {
  TEST_PUBLIC_KEY: string;
  TEST_TENANT: string;
}

function createProof(bindings: ProofBindings) {
  const config = {
    publicKey: bindings.TEST_PUBLIC_KEY,
    tenantId: bindings.TEST_TENANT,
    serviceCredentials: {},
  };
  const app = new Hono<I24HEnv>();
  app.onError((error, context) => {
    if (error instanceof ApiFailure) return context.json({ error: error.code }, 401);
    if (error instanceof HTTPException) return context.json({ error: 'UNAUTHENTICATED' }, 401);
    return context.json({ error: 'INTERNAL_ERROR' }, 500);
  });
  app.get('/health', (context) => context.json({ runtime: 'workerd' }));
  app.get('/missing-context', (context) => context.json(UserAuthInfo(context)));
  app.get('/raw', I24HTokenAuthGuard(config), (context) => context.json(UserAuthInfo(context)));
  const verifier = createAccessVerifier(config, serverClock);
  app.use('/bridge/*', async (context, next) => {
    const token = context.req.header('X-Test-Token');
    if (!token) throw new ApiFailure('UNAUTHENTICATED', 'Authentication required');
    const identity = await verifier.verify(token);
    context.set('authInfo', { userId: identity.subject, tenantId: identity.tenant });
    await next();
  });
  app.get('/bridge/identity', (context) => context.json(UserAuthInfo(context)));
  app.post('/bridge/json', async (context) => context.json(await context.req.json()));
  app.post('/bridge/multipart', async (context) => {
    const form = await context.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Missing file');
    return context.json({
      name: form.get('name'),
      file: file.name,
      bytes: [...new Uint8Array(await file.arrayBuffer())],
    });
  });
  app.post('/bridge/bytes', async (context) => new Response(await context.req.arrayBuffer()));
  return app;
}

export default {
  fetch(request: Request, env: ProofBindings) {
    return createProof(env).fetch(request);
  },
};
