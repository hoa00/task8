import { ApiErrorSchema, errorHttpStatus } from '@studio/contracts/api';
import type { ErrorHandler } from 'hono';
import type { ApiEnvironment } from '../runtime.ts';
import { commandAuthority, commandAuthorityStatus } from '../modules/auth/index.ts';
import { serverClock } from '../shared/clock.ts';
import { ApiFailure } from '../shared/errors.ts';

export const mapError: ErrorHandler<ApiEnvironment> = async (error, context) => {
  let code = error instanceof ApiFailure ? error.code : 'INTERNAL_ERROR';
  const principal = context.get('principal');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(context.req.method) &&
    principal?.authentication?.mechanism === 'oidc'
  ) {
    try {
      const state = await commandAuthorityStatus(
        context.get('repository'),
        commandAuthority(context.env.AUTH_MODE, principal),
      );
      if (state === 'invalid') code = 'UNAUTHENTICATED';
      else if (state === 'stale') code = 'AUTH_SERVICE_UNAVAILABLE';
    } catch {
      code = 'AUTH_SERVICE_UNAVAILABLE';
    }
  }
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
      error: {
        code,
        message:
          code === 'UNAUTHENTICATED'
            ? 'Authentication required'
            : code === 'AUTH_SERVICE_UNAVAILABLE'
              ? 'Authentication service is unavailable'
              : error instanceof ApiFailure
                ? error.message
                : 'Request failed',
      },
    }),
    errorHttpStatus[code],
  );
};
