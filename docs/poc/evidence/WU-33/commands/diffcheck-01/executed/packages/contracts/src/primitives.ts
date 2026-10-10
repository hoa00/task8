import { z } from 'zod';

// Date-only values are calendar dates. Parsing never depends on local timezone.
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined || year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= (days[month - 1] ?? 0);
}, 'Expected a real calendar date').brand<'DateOnly'>();
export type DateOnly = z.infer<typeof DateOnlySchema>;
export const InstantSchema = z.iso.datetime({ offset: false }).brand<'Instant'>();
export type Instant = z.infer<typeof InstantSchema>;
export const EntityIdSchema = z.uuid({ version: 'v7' }).brand<'EntityId'>();
export type EntityId = z.infer<typeof EntityIdSchema>;
// Foreign keys point to workspace membership, never a user ID or display name.
export const MemberIdSchema = EntityIdSchema;
export const ProjectIdSchema = EntityIdSchema;
export const ClientRequestIdSchema = z.uuid();
export const VersionSchema = z.number().int().positive().safe();
export const CountSchema = z.number().int().nonnegative().safe();
export const PositionSchema = z.number().int().safe();
export const NameSchema = z.string().trim().min(1).max(240);
export const ColorSchema = z.string().regex(/^#[\da-fA-F]{6}$/);
export const CursorSchema = z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/, 'Expected opaque base64url cursor');
export const EmptyInputSchema = z.strictObject({});
export const VersionInputSchema = z.strictObject({ expectedVersion: VersionSchema });
export const TaskVersionInputSchema = z.strictObject({ expectedTaskVersion: VersionSchema });
export const uniqueIds = z.array(EntityIdSchema).max(200).refine(ids => new Set(ids).size === ids.length, 'Duplicate IDs');
export const dateRangeValid = (value: { startDate?: DateOnly | null | undefined; dueDate?: DateOnly | null | undefined }) =>
  !value.startDate || !value.dueDate || value.startDate <= value.dueDate;
export const nonEmptyPatch = (value: object) => Object.entries(value).some(([key, field]) => key !== 'expectedVersion' && key !== 'expectedTaskVersion' && field !== undefined);
export const CursorQuerySchema = z.strictObject({ cursor: CursorSchema.optional(), limit: z.number().int().min(1).max(200).default(50) });
export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({ items: z.array(item), nextCursor: CursorSchema.nullable(), total: CountSchema })
    .refine(page => page.items.length <= page.total, 'Page exceeds exact total');
}
export type CursorPage<T> = { items: T[]; nextCursor: string | null; total: number };
export function apiSuccessSchema<T extends z.ZodType>(data: T) { return z.strictObject({ data }); }
export type ApiSuccess<T> = { data: T };
export const ErrorCodeSchema = z.enum(['VALIDATION_ERROR', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'VIEW_SCOPE_TOO_LARGE', 'PAYLOAD_TOO_LARGE', 'CAPABILITY_UNAVAILABLE', 'INTERNAL_ERROR']);
export const ApiErrorSchema = z.strictObject({ error: z.strictObject({
  code: ErrorCodeSchema, message: z.string().min(1).max(1000),
  // The contract permits a dictionary here; values are bounded arrays of messages.
  fieldErrors: z.record(z.string().min(1).max(200), z.array(z.string().max(500)).max(20)).optional(),
}) });
export type ApiError = z.infer<typeof ApiErrorSchema>;
export const errorHttpStatus = { VALIDATION_ERROR: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, VIEW_SCOPE_TOO_LARGE: 409, PAYLOAD_TOO_LARGE: 413, CAPABILITY_UNAVAILABLE: 501, INTERNAL_ERROR: 500 } as const satisfies { [K in z.infer<typeof ErrorCodeSchema>]: number };
