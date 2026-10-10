import {createFileRoute,redirect} from '@tanstack/react-router';
import {bootstrap} from '../app/route-context';
import {links} from '../app/navigation';
export const Route=createFileRoute('/_shell/w/$workspaceId/projects/$projectId/')({beforeLoad:async({context,params})=>{const data=await bootstrap(context);throw redirect({href:links.project(context.workspaceId,params.projectId,data.preferences.defaultTab),replace:true});}});
