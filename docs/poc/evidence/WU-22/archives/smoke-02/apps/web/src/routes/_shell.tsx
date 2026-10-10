import { createFileRoute, redirect } from '@tanstack/react-router';
import { AppShell } from '../app/shell/AppShell';
import { resolveWorkspace } from '../app/route-context';
import { cancelWorkspaceQueries } from '../data/invalidation';
import { validateRouteSearch } from '../app/navigation';
export const Route=createFileRoute('/_shell')({beforeLoad:async({context,location})=>{const requestedId=location.pathname.match(/^\/w\/([^/]+)/)?.[1]??validateRouteSearch(location.search).workspaceId;const previousId=context.navigation.workspaceId;if(previousId && requestedId && previousId!==requestedId){await cancelWorkspaceQueries(context.queryClient,previousId);if(validateRouteSearch(location.search).taskId){const search=new URLSearchParams(location.searchStr);search.delete('taskId');throw redirect({href:location.pathname+(search.size?'?'+search.toString():''),replace:true});}}return {workspaceId:await resolveWorkspace(context,requestedId)};},component:ShellRoute});
function ShellRoute(){const {workspaceId}=Route.useRouteContext();return <AppShell workspaceId={workspaceId}/>;}
