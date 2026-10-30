import { ApiErrorSchema, operations } from '@studio/contracts/api';
import { Hono } from 'hono';
import { RequestRepository } from './db/client.ts';
import {
  createSessionService,
  createOidcSessionService,
  createOidcBrowserService,
  type IdentityProvider,
} from './modules/auth/index.ts';
import {
  createAuthRoutes,
  createBrowserAuthRoutes,
  createAuthMetadataRoutes,
} from './modules/auth/routes.ts';
import {
  createAccessVerifier,
  createOidcProvider,
  createOidcBrowserProvider,
  oidcSettings,
  createIdentityProvider,
  type AuthSettings,
} from './modules/auth/http/index.ts';
import {
  createSessionCrypto,
  createOidcCrypto,
  createLoginCrypto,
} from './modules/auth/storage/index.ts';
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
export function createOidcService(env: ApiEnvironment['Bindings'], repository: RequestRepository) {
  const settings = oidcSettings(env);
  return createOidcSessionService({
    repository,
    clock: serverClock,
    generateId: newId,
    provider: createOidcProvider(settings),
    crypto: createOidcCrypto(settings),
    issuer: settings.issuer,
    clientId: settings.clientId,
  });
}
export function createOidcBrowser(env: ApiEnvironment['Bindings']) {
  const settings = oidcSettings(env),
    repository = authRepository(env);
  return createOidcBrowserService({
    repository,
    clock: serverClock,
    generateId: newId,
    crypto: createOidcCrypto(settings),
    loginCrypto: createLoginCrypto(settings),
    provider: createOidcBrowserProvider(settings),
    sessions: createOidcService(env, repository),
    issuer: settings.issuer,
    clientId: settings.clientId,
    origin: settings.origin,
  });
}
export function authRepository(env: ApiEnvironment['Bindings']) {
  return new RequestRepository(env.DB, { primary: true });
}
export function createApp(deps: AppDependencies = {}) {
  const app = new Hono<ApiEnvironment>();
  app.onError(mapError);
  app.use('*', correlationMiddleware);
  app.route('/auth', createBrowserAuthRoutes(createOidcBrowser));
  app.route('/api/v1', createAuthMetadataRoutes());
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
        ['ict24h', 'oidc'].includes(bindings.AUTH_MODE ?? '')
          ? authRepository(bindings)
          : new RequestRepository(bindings.DB),
      (env, repository, settings) => createAuthService(env, repository, settings, deps),
      createOidcService,
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
