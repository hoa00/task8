import { z } from 'zod';
import { CapabilitiesSchema, UserProfileSchema } from './models.ts';
import { EntityIdSchema, InstantSchema } from './primitives.ts';

// These contracts remain separate until canonical session consumers activate together.
function passwordWithinByteLimit(value: string): boolean {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point === undefined || (point >= 0xd800 && point <= 0xdfff)) return false;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > 1024) return false;
  }
  return true;
}
export const AuthLoginInputSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(6).max(1024).refine(passwordWithinByteLimit, 'Expected valid Unicode within password byte limit'),
  remember: z.boolean(),
});
export const AuthSessionMetadataSchema = z.strictObject({
  id: EntityIdSchema,
  accessExpiresAt: InstantSchema,
  expiresAt: InstantSchema,
});
export const Ict24hCapabilitiesSchema = CapabilitiesSchema.extend({
  dataMode: z.literal('http'),
  identityMode: z.literal('ict24h'),
  features: CapabilitiesSchema.shape.features.extend({ authentication: z.literal('implemented') }),
});
export const Ict24hSessionSchema = z.strictObject({
  user: UserProfileSchema,
  currentWorkspaceId: EntityIdSchema.nullable(),
  capabilities: Ict24hCapabilitiesSchema,
  authSession: AuthSessionMetadataSchema,
});
export const AuthLogoutResultSchema = z.strictObject({ signedOut: z.literal(true) });
export type AuthLoginInput = z.infer<typeof AuthLoginInputSchema>;
export type AuthSessionMetadata = z.infer<typeof AuthSessionMetadataSchema>;
export type Ict24hSessionDto = z.infer<typeof Ict24hSessionSchema>;
