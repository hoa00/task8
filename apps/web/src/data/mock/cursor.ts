import { z } from 'zod';
import type { FileDto } from '@studio/contracts/api';
import { EntityIdSchema, FileSchema } from '@studio/contracts/api';
import { StudioApiError } from '../errors.ts';
const signature = z.string().regex(/^[a-f0-9]{64}$/);
export const anchorCursorSchema = z.strictObject({
  signature,
  id: EntityIdSchema,
  at: z.string().max(40),
});
export const idCursorSchema = z.strictObject({ signature, id: z.string().min(1).max(100) });
export const fileTupleSchema = z.strictObject({
  id: EntityIdSchema,
  name: FileSchema.shape.name,
  fileType: FileSchema.shape.fileType,
  sizeBytes: FileSchema.shape.sizeBytes,
  createdAt: FileSchema.shape.createdAt,
});
export const fileCursorSchema = z.strictObject({ signature, tuple: fileTupleSchema });
export const archiveCursorSchema = anchorCursorSchema.extend({ rank: z.number().int() });
export const notificationCursorSchema = z.strictObject({
  scope: z.string().max(400),
  id: EntityIdSchema,
  at: z.string().max(40),
});
function invalid(): never {
  throw new StudioApiError({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid cursor or query scope. Restart this feed.',
      fieldErrors: { cursor: ['Restart this feed.'] },
    },
  });
}
export function encodeMockCursor(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 2, data: value }));
  const cursor = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  if (cursor.length > 2048) return invalid();
  return cursor;
}
export function decodeMockCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    if (!/^[A-Za-z0-9_-]{1,2048}$/.test(cursor)) return invalid();
    const bytes = Uint8Array.from(atob(cursor.replaceAll('-', '+').replaceAll('_', '/')), (value) =>
      value.charCodeAt(0),
    );
    const value = z
      .strictObject({ v: z.literal(2), data: z.unknown() })
      .parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (encodeMockCursor(value.data) !== cursor) return invalid();
    return schema.parse(value.data);
  } catch {
    return invalid();
  }
}

export function fileCursorTuple({ id, name, fileType, sizeBytes, createdAt }: FileDto) {
  return fileTupleSchema.parse({ id, name, fileType, sizeBytes, createdAt });
}
