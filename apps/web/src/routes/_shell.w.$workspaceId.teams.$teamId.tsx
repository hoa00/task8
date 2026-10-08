import {createFileRoute,notFound} from '@tanstack/react-router';
import {bootstrap,validId} from '../app/route-context';
import {PendingPage} from '../app/shell/PendingPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/teams/$teamId')({beforeLoad:async({context,params})=>{validId(params.teamId);if(!(await bootstrap(context)).teams.some(item=>item.id===params.teamId))throw notFound();},component:PendingPage});
