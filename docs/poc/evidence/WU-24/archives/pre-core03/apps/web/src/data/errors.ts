import { ApiErrorSchema, errorHttpStatus } from '@studio/contracts/api';
import type { ApiError } from '@studio/contracts/api';

export class StudioApiError extends Error {
  readonly detail: ApiError['error'];
  readonly status: number;
  constructor(envelope: ApiError, status: number = errorHttpStatus[envelope.error.code]) {
    const parsed = ApiErrorSchema.parse(envelope);
    super(parsed.error.message);
    this.name = 'StudioApiError';
    this.detail = parsed.error;
    this.status = status;
  }
}

export class StudioTransportError extends Error {
  readonly kind: 'offline' | 'network' | 'invalidResponse';
  constructor(kind: StudioTransportError['kind'], message: string) {
    super(message);
    this.name = 'StudioTransportError';
    this.kind = kind;
  }
}

export function unavailable(operation: string): StudioApiError {
  return new StudioApiError({ error: { code: 'CAPABILITY_UNAVAILABLE', message: `${operation} is not implemented in this adapter yet` } });
}
