import { ApiErrorSchema, operations } from '@studio/contracts/api';
import { Hono } from 'hono';
import { RequestRepository } from './db/client.ts';
import { createSessionService, type IdentityProvider } from './modules/auth/index.ts';
import { createAuthRoutes } from './modules/auth/routes.ts';
import {
  createAccessVerifier,
  createIdentityProvider,
  type AuthSettings,
} from './modules/auth/http/index.ts';
import { createSessionCrypto } from './modules/auth/storage/index.ts';
import { serverClock } from './shared/clock.ts';
import { newId } from './shared/ids.ts';
import { ApiFailure } from './shared/errors.ts';
import { correlationMiddleware } from './http/correlation.ts';
import { mapError } from './http/error-handler.ts';
import { routes } from './http/routes.ts';
import { createPrincipalMiddleware } from './middleware.ts';
import type { ApiEnvironment } from './runtime.ts';
import { createDiagnosticReporter } from './shared/diagnostics.ts';
import { createR2Storage } from './storage/r2.ts';
export interface AppDependencies {
  identityProvider?: (env: ApiEnvironment['Bindings'], settings: AuthSettings) => IdentityProvider;
}
export function createAuthService(
  env: ApiEnvironment['Bindings'],
  repository: RequestRepository,
  settings: AuthSettings,
  deps: AppDependencies = {},
) {
  try {
    return createSessionService({
      repository,
      clock: serverClock,
      generateId: newId,
      provider: deps.identityProvider
        ? deps.identityProvider(env, settings)
        : createIdentityProvider(
            { baseUrl: settings.baseUrl, tenantId: settings.tenantId },
            { clock: serverClock, fetch },
          ),
      verifier: createAccessVerifier(settings, serverClock),
      crypto: createSessionCrypto(settings.encryptionKey),
      tenantId: settings.tenantId,
      maxAgeSeconds: settings.maxAgeSeconds,
    });
  } catch {
    throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Authentication configuration is unavailable');
  }
}
export function authRepository(env: ApiEnvironment['Bindings']) {
  return new RequestRepository(env.DB, { primary: true });
}
export function createApp(deps: AppDependencies = {}) {
  const app = new Hono<ApiEnvironment>();
  app.onError(mapError);
  app.use('*', correlationMiddleware);
  app.route(
    '/api/v1/auth',
    createAuthRoutes(
      (env, repository, settings) => createAuthService(env, repository, settings, deps),
      authRepository,
    ),
  );
  app.use(
    '/api/v1/*',
    createPrincipalMiddleware(
      (bindings) =>
        bindings.AUTH_MODE === 'ict24h'
          ? authRepository(bindings)
          : new RequestRepository(bindings.DB),
      (env, repository, settings) => createAuthService(env, repository, settings, deps),
    ),
  );
  app.use('/api/v1/*', async (c, next) => {
    c.set('fileStorage', createR2Storage(c.env.FILES));
    c.set(
      'diagnostics',
      createDiagnosticReporter({
        requestId: c.get('requestId'),
        operation: c.get('operation'),
        startedAt: c.get('requestStartedAt'),
      }),
    );
    await next();
  });
  app.route('/api/v1', routes);
  app.notFound((c) => {
    const known = Object.values(operations).some(
      (op) =>
        op.method === c.req.method &&
        new RegExp('^' + op.path.replace(/\{[^}]+\}/gu, '[^/]+') + '$', 'u').test(c.req.path),
    );
    return c.json(
      ApiErrorSchema.parse({
        error: {
          code: known ? 'CAPABILITY_UNAVAILABLE' : 'NOT_FOUND',
          message: known ? 'Operation is not implemented' : 'Not found',
        },
      }),
      known ? 501 : 404,
    );
  });
  return app;
}
export default createApp();
