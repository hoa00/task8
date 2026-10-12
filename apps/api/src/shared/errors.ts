import type { ApiError } from '@studio/contracts/api';

export class ApiFailure extends Error {
  readonly code: ApiError['error']['code'];
  constructor(code: ApiError['error']['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiFailure';
    this.code = code;
  }
}

export function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new ApiFailure('INTERNAL_ERROR', message);
  return value;
}
