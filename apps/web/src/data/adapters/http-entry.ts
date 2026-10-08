import { systemClock } from '@studio/domain';
import type { PublicEnv } from '../../app/env.ts';
import type { DataRuntime } from '../runtime.ts';
import { createHttpClient } from './http.ts';

export function createDataRuntime(env: PublicEnv): DataRuntime {
  if (env.dataMode !== 'http') throw new Error('Data mode differs from the built adapter');
  return { client: createHttpClient({ baseUrl: env.apiBaseUrl }), clock: systemClock };
}
