import { createPeopleDemo } from '../people-demo.ts';
import { systemClock } from '@studio/domain';
import type { PublicEnv } from '../runtime.ts';
import type { DataRuntime } from '../runtime.ts';
import { createHttpClient } from './http.ts';
import { createSecurityBillingDemo } from '../security-billing-demo.ts';
import { createHttpAuth } from '../auth.ts';
import { createOnboardingDemo, onboardingFlowId } from '../onboarding-demo.ts';

export function createDataRuntime(env: PublicEnv): DataRuntime {
  if (env.dataMode !== 'http') throw new Error('Data mode differs from the built adapter');
  const client = createHttpClient({ baseUrl: env.apiBaseUrl, auth: () => auth });
  const auth = createHttpAuth(client);
  return {
    client,
    clock: systemClock,
    peopleDemo: createPeopleDemo(
      systemClock,
      typeof localStorage === 'undefined' ? undefined : localStorage,
    ),
    securityBillingDemo: createSecurityBillingDemo(
      undefined,
      typeof localStorage === 'undefined' ? undefined : localStorage,
    ),
    auth,
    onboardingDemo: createOnboardingDemo(
      onboardingFlowId(),
      async () => {
        const session = await client.execute('getSession', {});
        if (!session.data.currentWorkspaceId) throw new Error('Workspace access is required');
        return { workspaceId: session.data.currentWorkspaceId, projectId: null, mode: 'seed-demo' };
      },
      typeof localStorage === 'undefined' ? undefined : localStorage,
      'task8.demo.onboarding.http.v1',
    ),
  };
}
