import { createApp, authRepository, createAuthService } from '../../src/app.ts';
import {
  createIdentityProvider,
  authSettings,
  requestSid,
} from '../../src/modules/auth/http/index.ts';
import { serverClock } from '../../src/shared/clock.ts';
import type { ApiEnvironment } from '../../src/runtime.ts';
import { z } from 'zod';
import { ApiFailure } from '../../src/shared/errors.ts';

const provider = (control: string) =>
  createIdentityProvider(
    { baseUrl: 'https://identity.example.invalid', tenantId: 'ict24h-rdn-dev' },
    {
      clock: serverClock,
      fetch: async (url, init) => {
        try {
          const response = await fetch(control + new URL(String(url)).pathname, init);
          console.log('controlled provider transport', {
            status: response.status,
            contentType: response.headers.get('content-type'),
          });
          return response;
        } catch (error) {
          console.log('controlled provider transport failed', {
            type: error instanceof Error ? error.name : typeof error,
            redirect: error instanceof Error && /redirect/iu.test(error.message),
            signal: error instanceof Error && /signal/iu.test(error.message),
            connection: error instanceof Error && /connect|refused/iu.test(error.message),
            unsupported:
              error instanceof Error && /not supported|unsupported/iu.test(error.message),
            invalidUrl: error instanceof Error && /url|scheme|protocol/iu.test(error.message),
          });
          throw error;
        }
      },
    },
  );

export default {
  async fetch(
    request: Request,
    env: ApiEnvironment['Bindings'] & { TEST_PROVIDER_URL: string },
    context: ExecutionContext,
  ): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health') return Response.json({ ready: true });
    if (path === '/__auth/sql') {
      const input = z
        .object({
          sql: z.string(),
          parameters: z.array(z.union([z.string(), z.number(), z.null()])).default([]),
        })
        .parse(await request.json());
      return Response.json(
        await env.DB.prepare(input.sql)
          .bind(...input.parameters)
          .all(),
      );
    }
    const app = createApp({ identityProvider: () => provider(env.TEST_PROVIDER_URL) });
    let primary = false,
      batches = 0;
    const binding = new Proxy(env.DB, {
      get(target, key) {
        if (key === 'withSession')
          return (constraint: D1SessionBookmark | string) => {
            primary = constraint === 'first-primary';
            const session = target.withSession(constraint);
            return new Proxy(session, {
              get(owner, property) {
                if (property === 'batch')
                  return async <T>(statements: D1PreparedStatement[]) => {
                    if (request.headers.get('X-Test-DB') === 'fail')
                      throw new Error('controlled storage failure');
                    const result = await owner.batch<T>(statements);
                    if (
                      request.headers.get('X-Test-DB') === 'ack-loss' &&
                      ++batches === (path.endsWith('/login') ? 2 : 1)
                    )
                      throw new Error('controlled lost acknowledgement');
                    return result;
                  };
                const value = Reflect.get(owner, property, owner);
                return typeof value === 'function' ? value.bind(owner) : value;
              },
            });
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const bindings = { ...env, DB: binding };
    if (path === '/__auth/current') {
      try {
        const repository = authRepository(bindings);
        const settings = authSettings(bindings);
        const service = createAuthService(bindings, repository, settings, {
          identityProvider: () => provider(env.TEST_PROVIDER_URL),
        });
        const result = await service.authenticate(requestSid(request, settings));
        return Response.json({ data: result.session, statements: repository.statements, primary });
      } catch (error) {
        return Response.json(
          { error: error instanceof ApiFailure ? error.code : 'INTERNAL_ERROR' },
          { status: error instanceof ApiFailure && error.code === 'UNAUTHENTICATED' ? 401 : 503 },
        );
      }
    }
    const response = await app.fetch(request, bindings, context);
    response.headers.set('X-Test-Primary', String(primary));
    return response;
  },
};
