import {createFileRoute,redirect} from '@tanstack/react-router';
import {links} from '../app/navigation';
export const Route=createFileRoute('/_shell/w/$workspaceId/projects/$projectId/')({beforeLoad:({context,params})=>{throw redirect({href:links.project(context.workspaceId,params.projectId),replace:true});}});
