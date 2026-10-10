import type { Clock } from '@studio/domain';
import type { PeopleDemoAdapter } from './people-demo.ts';
import type { SharingDemoAdapter } from './sharing-demo.ts';
import type { StudioClient } from './operations.ts';
import type { SecurityBillingDemoAdapter } from './security-billing-demo.ts';
import type { AuthDemoAdapter } from './auth-demo.ts';
import type { OnboardingDemoAdapter } from './onboarding-demo.ts';

// Services only. Server state stays in TanStack Query, never in this context.
export interface DataRuntime { client: StudioClient; clock: Clock; sharingDemo?: SharingDemoAdapter; peopleDemo?: PeopleDemoAdapter; securityBillingDemo?: SecurityBillingDemoAdapter; authDemo?: AuthDemoAdapter; onboardingDemo?: OnboardingDemoAdapter; selectDemoWorkspace?: (workspaceId: string) => void }
