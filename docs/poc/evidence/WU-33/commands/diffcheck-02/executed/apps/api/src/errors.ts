import { ApiErrorSchema, errorHttpStatus } from '@studio/contracts/api';
import type { ApiError } from '@studio/contracts/api';
import { ZodError } from 'zod';
import type { ErrorHandler } from 'hono';
import type { ApiEnvironment } from './runtime.ts';
export class ApiFailure extends Error {
  constructor(readonly code: ApiError['error']['code'], message: string) { super(message); }
}
export const mapError: ErrorHandler<ApiEnvironment> = (error, context) => {
  if (error instanceof ZodError) return context.json(ApiErrorSchema.parse({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request' } }), 400);
  if (error instanceof ApiFailure) return context.json(ApiErrorSchema.parse({ error: { code: error.code, message: error.message } }), errorHttpStatus[error.code]);
  // Database internals, stack traces and values never cross the DTO boundary.
  console.error('API request failed', error.name);
  return context.json(ApiErrorSchema.parse({ error: { code: 'INTERNAL_ERROR', message: 'Request failed' } }), 500);
};
