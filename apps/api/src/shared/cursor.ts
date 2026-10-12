import { CursorPayloadSchema } from '@studio/contracts/api';
import type { z } from 'zod';
import { ApiFailure } from './errors.ts';
export type CursorPayload = z.output<typeof CursorPayloadSchema>;
export async function queryFingerprint(scope: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(scope)),
  );
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
export function encodeCursor(payload: z.input<typeof CursorPayloadSchema>): string {
  return btoa(
    String.fromCharCode(
      ...new TextEncoder().encode(JSON.stringify(CursorPayloadSchema.parse(payload))),
    ),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
export function decodeCursor(
  encoded: string,
  binding: Pick<CursorPayload, 'queryFingerprint' | 'sortField' | 'sortDirection'>,
): CursorPayload {
  try {
    const bytes = Uint8Array.from(
      atob(encoded.replaceAll('-', '+').replaceAll('_', '/')),
      (value) => value.charCodeAt(0),
    );
    const cursor = CursorPayloadSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    if (
      cursor.queryFingerprint !== binding.queryFingerprint ||
      cursor.sortField !== binding.sortField ||
      cursor.sortDirection !== binding.sortDirection
    )
      throw new Error('Cursor binding mismatch');
    return cursor;
  } catch (error) {
    throw new ApiFailure('VALIDATION_ERROR', 'Invalid cursor for query', { cause: error });
  }
}
