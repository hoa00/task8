import { createFileRoute, redirect } from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
export const Route = createFileRoute('/forgot-password')({ validateSearch: (input): { state?: 'sent' } => input.state === 'sent' ? { state: 'sent' } : {}, beforeLoad: ({ location }) => { const state = new URLSearchParams(location.searchStr).get('state'); if (state !== null && state !== 'sent') throw redirect({ to: '/forgot-password', search: {}, replace: true }); }, component: Page });
function Page() { const { state } = Route.useSearch(); return <AuthPage screen={state === 'sent' ? 'forgot-sent' : 'forgot'} />; }
