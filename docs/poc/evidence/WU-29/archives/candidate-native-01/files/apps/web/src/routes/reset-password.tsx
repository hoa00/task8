import { createFileRoute, redirect } from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
export const Route = createFileRoute('/reset-password')({ validateSearch: (input): { state?: 'done' } => input.state === 'done' ? { state: 'done' } : {}, beforeLoad: ({ location }) => { const state = new URLSearchParams(location.searchStr).get('state'); if (state !== null && state !== 'done') throw redirect({ to: '/reset-password', search: {}, replace: true }); }, component: Page });
function Page() { const { state } = Route.useSearch(); return <AuthPage screen={state === 'done' ? 'reset-done' : 'reset'} />; }
