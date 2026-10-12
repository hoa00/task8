import { ApiErrorSchema, operations } from '@studio/contracts/api';
import { Hono } from 'hono';
import { RequestRepository } from './db/client.ts';
import { correlationMiddleware } from './http/correlation.ts';
import { mapError } from './http/error-handler.ts';
import { routes } from './http/routes.ts';
import { createPrincipalMiddleware } from './middleware.ts';
import type { ApiEnvironment } from './runtime.ts';
import { createDiagnosticReporter } from './shared/diagnostics.ts';
import { createR2Storage } from './storage/r2.ts';
const app = new Hono<ApiEnvironment>();
app.onError(mapError);
app.use('*', correlationMiddleware);
app.use(
  '/api/v1/*',
  createPrincipalMiddleware((bindings) => new RequestRepository(bindings.DB)),
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
export default app;
