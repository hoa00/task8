import {createFileRoute,notFound} from '@tanstack/react-router';
import {bootstrap,validId} from '../app/route-context';
import {PendingPage} from '../app/shell/PendingPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/members/$memberId')({beforeLoad:async({context,params})=>{validId(params.memberId);if(!(await bootstrap(context)).members.some(item=>item.id===params.memberId))throw notFound();},component:PendingPage});
