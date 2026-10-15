import { z } from 'zod';

const relativeApiPath = z
  .string()
  .regex(/^\/api(?:\/[A-Za-z0-9_-]+)*$/, 'API URL must be an origin-relative /api path');
const publicEnvSchema = z.object({
  dataMode: z.enum(['mock', 'http']).default('mock'),
  apiBaseUrl: relativeApiPath.default('/api/v1'),
});

import type { PublicEnv } from '../data/runtime.ts';
export type { PublicEnv } from '../data/runtime.ts';

export function parsePublicEnv(input: Record<string, unknown>): PublicEnv {
  const publicKeys = new Set(['VITE_DATA_MODE', 'VITE_API_BASE_URL']);
  for (const key of Object.keys(input)) {
    if (key.startsWith('VITE_') && !publicKeys.has(key)) {
      throw new Error('Unsupported public environment variable');
    }
  }
  return publicEnvSchema.parse({
    dataMode: input.VITE_DATA_MODE,
    apiBaseUrl: input.VITE_API_BASE_URL,
  });
}
