import type { ApiError } from '@studio/contracts/api';

export class ApiFailure extends Error {
  constructor(
    readonly code: ApiError['error']['code'],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiFailure';
  }
}
