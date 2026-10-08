import type { PublicEnv } from '../../app/env.ts';
import type { DataRuntime } from '../runtime.ts';
import { browserMockStorage } from '../mock/persistence.ts';
import { fixtureClock } from '../mock/seed.ts';
import { createMockClient } from './mock.ts';

export function createDataRuntime(env: PublicEnv): DataRuntime {
  if (env.dataMode !== 'mock') throw new Error('Data mode differs from the built adapter');
  const storage = browserMockStorage();
  return { client: createMockClient({ ...(storage ? { storage } : {}), environment: import.meta.env.DEV ? 'development' : 'production' }), clock: fixtureClock };
}
