import { createFileRoute } from '@tanstack/react-router';
import { OnboardingPage } from '../features/onboarding/OnboardingPage';
export const Route = createFileRoute('/onboarding')({ validateSearch: input => ({ step: Number.isInteger(Number(input.step)) && Number(input.step) >= 0 && Number(input.step) <= 5 ? Number(input.step) : 0 }), component: OnboardingRoute });
function OnboardingRoute() { return <OnboardingPage step={Route.useSearch().step} />; }
