import { useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';
import { Button, EmptyState, Skeleton } from '@studio/ui';
export function LoadingBoundary() { return <div className="flex flex-col gap-3 p-6" role="status" aria-label="Loading workspace"><Skeleton className="h-6 w-48" /><Skeleton className="h-10 w-full" /><span className="sr-only">Loading…</span></div>; }
export function NotFoundBoundary() { useEffect(() => { document.title = 'Not found · Gr8r Studio'; }, []); return <EmptyState icon="circle-help" heading="Page not found" description="This page does not exist or is no longer available." />; }
export function ErrorBoundary({ reset }: { reset?: () => void }) { const router = useRouter(); useEffect(()=>{document.title='Something went wrong · Gr8r Studio';},[]); return <EmptyState icon="circle-alert" heading="Something went wrong" description="We couldn't load this page. Try again." action={<Button onClick={() => { reset?.(); void router.invalidate(); }}>Try again</Button>} />; }
export function AccessDeniedBoundary() { return <EmptyState icon="lock" heading="Access restricted" description="You don't have access to this private project." />; }
