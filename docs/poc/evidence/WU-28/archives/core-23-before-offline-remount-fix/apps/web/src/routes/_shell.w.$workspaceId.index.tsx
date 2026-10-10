import {createFileRoute,redirect} from '@tanstack/react-router';
import {bootstrap} from '../app/route-context';
import {links} from '../app/navigation';
export const Route=createFileRoute('/_shell/w/$workspaceId/')({beforeLoad:async({context})=>{const data=await bootstrap(context);throw redirect({href:links.workspace(context.workspaceId,data.preferences.home==='mytasks'?'my-tasks':data.preferences.home),replace:true});}});
