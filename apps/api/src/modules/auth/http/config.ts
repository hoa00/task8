import { z } from 'zod';

export const authProviderLimits = {
  responseBytes: 65536,
  timeoutMs: 10000,
  tokenBytes: 16384,
} as const;
const ProviderConfigSchema = z.strictObject({
  baseUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  }, 'Expected an HTTPS provider URL without credentials, query or fragment'),
  tenantId: z
    .string()
    .min(1)
    .max(240)
    .refine((value) => value.trim() === value && !/[\r\n]/u.test(value)),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export function providerConfig(input: unknown): ProviderConfig {
  // Invalid server configuration is a setup error; never report it as bad credentials.
  const config = ProviderConfigSchema.safeParse(input);
  if (!config.success) throw new Error('Invalid identity provider configuration');
  return config.data;
}
