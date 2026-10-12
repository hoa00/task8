import { normalizeDescription } from '@studio/domain';
import { ApiFailure } from '../../../shared/errors.ts';
export function normalizeTaskDescription(value: string) {
  const normalized = normalizeDescription(value);
  if (normalized.html.length > 100000)
    throw new ApiFailure('VALIDATION_ERROR', 'Sanitized description exceeds limit');
  return normalized;
}
