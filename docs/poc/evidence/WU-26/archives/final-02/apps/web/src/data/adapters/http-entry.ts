import { createPeopleDemo } from '../people-demo.ts';
import { systemClock } from '@studio/domain';
import type { PublicEnv } from '../../app/env.ts';
import type { DataRuntime } from '../runtime.ts';
import { createHttpClient } from './http.ts';
import { createSecurityBillingDemo } from '../security-billing-demo.ts';
import { createAuthDemo } from '../auth-demo.ts';

export function createDataRuntime(env: PublicEnv): DataRuntime {
  if (env.dataMode !== 'http') throw new Error('Data mode differs from the built adapter');
  return { client: createHttpClient({ baseUrl: env.apiBaseUrl }), clock: systemClock, peopleDemo: createPeopleDemo(systemClock, typeof localStorage === 'undefined' ? undefined : localStorage), securityBillingDemo: createSecurityBillingDemo(undefined, typeof localStorage === 'undefined' ? undefined : localStorage), authDemo: createAuthDemo() };
}
