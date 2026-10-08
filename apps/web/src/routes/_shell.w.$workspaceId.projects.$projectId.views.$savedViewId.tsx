import {createFileRoute,notFound} from '@tanstack/react-router';
import {validId,validateProject} from '../app/route-context';
import {studioQueryOptions} from '../data/queries';
import {PendingPage} from '../app/shell/PendingPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/projects/$projectId/views/$savedViewId')({beforeLoad:async({context,params})=>{validId(params.savedViewId);const item=await validateProject(context,params.projectId);if(item.access==='restricted')return;const result=await context.queryClient.ensureQueryData(studioQueryOptions(context.runtime.client,'listSavedViews',{workspaceId:context.workspaceId,projectId:params.projectId}));if(!result.data.some(view=>view.id===params.savedViewId))throw notFound();},component:PendingPage});
