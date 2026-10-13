import { z } from 'zod';

// Central IDs are not task8 UUIDv7 IDs. Unknown central fields are discarded.
export const ProviderProfileSchema = z.object({
  id: z.uuid(),
  srv_t: z.string().min(1).max(240),
  email: z.email().max(254),
  username: z.string().max(4096).nullable().optional(),
  fullname: z.string().max(4096).nullable().optional(),
});
export const ProviderTokenSchema = z.object({
  token: z.string().min(1).max(16384),
  expires: z.iso.datetime({ offset: false }),
});
export const ProviderTokensSchema = z.object({
  access: ProviderTokenSchema,
  refresh: ProviderTokenSchema,
});
export const ProviderLoginSchema = z.object({
  user: ProviderProfileSchema,
  tokens: ProviderTokensSchema,
});
export type ProviderProfile = z.infer<typeof ProviderProfileSchema>;
export type ProviderTokens = z.infer<typeof ProviderTokensSchema>;
export type ProviderLogin = z.infer<typeof ProviderLoginSchema>;
export interface ProviderLoginInput {
  email: string;
  password: string;
}
export interface IdentityProvider {
  login(input: ProviderLoginInput): Promise<ProviderLogin>;
  refresh(refreshToken: string): Promise<ProviderTokens>;
  whoami(accessToken: string): Promise<ProviderProfile>;
}
