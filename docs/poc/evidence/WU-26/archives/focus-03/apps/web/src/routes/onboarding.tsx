import { createFileRoute } from '@tanstack/react-router';
import { AuthLayout } from '../features/auth/AuthLayout';
export const Route = createFileRoute('/onboarding')({ validateSearch: input => ({ step: Number.isInteger(Number(input.step)) && Number(input.step) >= 0 && Number(input.step) <= 5 ? Number(input.step) : 0 }), component: () => <AuthLayout><section className="w-full max-w-[560px] text-center"><h1 className="text-2xl font-semibold">Onboarding</h1><p>Pending · WU-27 owns the six-step onboarding flow.</p></section></AuthLayout> });
