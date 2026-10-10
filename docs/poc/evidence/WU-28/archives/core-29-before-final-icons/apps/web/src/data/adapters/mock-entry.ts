import type { PublicEnv } from '../../app/env.ts';
import type { DataRuntime } from '../runtime.ts';
import { browserMockStorage } from '../mock/persistence.ts';
import { fixtureClock } from '../mock/seed.ts';
import { createPeopleDemo } from '../people-demo.ts';
import { createSharingDemo } from '../mock/sharing-demo.ts';
import { createMockClient } from './mock.ts';
import { createSecurityBillingDemo } from '../security-billing-demo.ts';
import { createAuthDemo, readAuthScenario } from '../auth-demo.ts';
import { createOnboardingDemo } from '../onboarding-demo.ts';
import { newMockId } from '../mock/task-fields.ts';

export function createDataRuntime(env: PublicEnv): DataRuntime {
  if (env.dataMode !== 'mock') throw new Error('Data mode differs from the built adapter');
  const storage = browserMockStorage();
  const client = createMockClient({ ...(storage ? { storage } : {}), environment: import.meta.env.DEV ? 'development' : 'production', allowDemoReset: true });
  const runtime: DataRuntime = { client, isDemoOffline: () => client.isDemoOffline(), setDemoOffline: value => client.setDemoOffline(value), resetDemoFixture: async () => { const workspaceId = client.reset({ durable: true }); if (storage && typeof localStorage !== "undefined") { const prefixes = ["task8.demo.people.v1:", "task8.demo.sharing.v1:", "task8.demo.security-billing.v1:", "task8.ui.task", "task8.ui.project"]; const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => !!key && prefixes.some(prefix => key.startsWith(prefix))); for (const key of keys) storage.removeItem(key); } runtime.peopleDemo = createPeopleDemo(fixtureClock, storage); runtime.sharingDemo = createSharingDemo(fixtureClock, storage); runtime.securityBillingDemo = createSecurityBillingDemo(fixtureClock, storage); runtime.authDemo?.reset(); runtime.onboardingDemo = createOnboardingDemo(newMockId(fixtureClock), draft => client.completeOnboarding(draft), storage); return workspaceId; }, selectDemoWorkspace: workspaceId => client.selectWorkspace(workspaceId), clock: fixtureClock, sharingDemo: createSharingDemo(fixtureClock, storage), peopleDemo: createPeopleDemo(fixtureClock, storage), securityBillingDemo: createSecurityBillingDemo(fixtureClock, storage), authDemo: createAuthDemo(undefined, readAuthScenario(storage)), onboardingDemo: createOnboardingDemo(newMockId(fixtureClock), draft => client.completeOnboarding(draft), storage) };
  return runtime;
}
