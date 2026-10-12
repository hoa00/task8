import { ApiErrorSchema, operations } from '@studio/contracts/api';
import { Hono } from 'hono';
import { RequestRepository } from './db/client.ts';
import { correlationMiddleware } from './http/correlation.ts';
import { mapError } from './http/error-handler.ts';
import { createPrincipalMiddleware } from './middleware.ts';
import { routes } from './modules/routes.ts';
import type { ApiEnvironment } from './runtime.ts';
const app = new Hono<ApiEnvironment>();
app.onError(mapError);
app.use('*', correlationMiddleware);
app.use(
  '/api/v1/*',
  createPrincipalMiddleware((bindings) => new RequestRepository(bindings.DB)),
);
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
