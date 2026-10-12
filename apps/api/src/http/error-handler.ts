import { ApiErrorSchema, errorHttpStatus } from '@studio/contracts/api';
import type { ErrorHandler } from 'hono';
import type { ApiEnvironment } from '../runtime.ts';
import { serverClock } from '../shared/clock.ts';
import { ApiFailure } from '../shared/errors.ts';

export const mapError: ErrorHandler<ApiEnvironment> = (error, context) => {
  const code = error instanceof ApiFailure ? error.code : 'INTERNAL_ERROR';
  if (code === 'INTERNAL_ERROR')
    console.error('API request failed', {
      requestId: context.get('requestId'),
      operation: context.get('operation'),
      errorCode: code,
      errorType: error.name,
      phase: 'request',
      durationMs: serverClock.now() - (context.get('requestStartedAt') ?? serverClock.now()),
    });
  return context.json(
    ApiErrorSchema.parse({
      error: { code, message: error instanceof ApiFailure ? error.message : 'Request failed' },
    }),
    errorHttpStatus[code],
  );
};
