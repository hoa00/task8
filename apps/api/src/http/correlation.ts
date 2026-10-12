import { operations } from '@studio/contracts/api';
import { createMiddleware } from 'hono/factory';
import type { ApiEnvironment } from '../runtime.ts';
import { serverClock } from '../shared/clock.ts';

const paths = Object.entries(operations).map(([name, operation]) => ({
  name,
  method: operation.method,
  path: new RegExp('^' + operation.path.replace(/\{[^}]+\}/gu, '[^/]+') + '$', 'u'),
}));
export const correlationMiddleware = createMiddleware<ApiEnvironment>(async (context, next) => {
  // Correlation is server-owned; never reflect an arbitrary client header into logs.
  context.set('requestId', crypto.randomUUID());
  context.set('requestStartedAt', serverClock.now());
  context.set(
    'operation',
    paths.find((row) => row.method === context.req.method && row.path.test(context.req.path))
      ?.name ?? 'unknown',
  );
  await next();
  context.header('x-request-id', context.get('requestId'));
});
