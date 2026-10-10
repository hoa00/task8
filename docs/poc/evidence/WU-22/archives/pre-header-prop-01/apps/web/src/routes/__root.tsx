import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { StudioRouterContext } from '../app/route-context';
import { ErrorBoundary, LoadingBoundary, NotFoundBoundary } from '../app/shell/Boundaries';
import { validateRouteSearch } from '../app/navigation';
export const Route = createRootRouteWithContext<StudioRouterContext>()({component:RootRoute,validateSearch:validateRouteSearch,errorComponent:ErrorBoundary,pendingComponent:LoadingBoundary,notFoundComponent:NotFoundBoundary});
function RootRoute(){return <Outlet/>;}
