import { createFileRoute,redirect } from '@tanstack/react-router';
import { bootstrap,resolveWorkspace } from '../app/route-context';
import { links } from '../app/navigation';
export const Route=createFileRoute('/')({beforeLoad:async({context})=>{const workspaceId=await resolveWorkspace(context);const data=await bootstrap({...context,workspaceId});throw redirect({href:links.workspace(workspaceId,data.preferences.home==='mytasks'?'my-tasks':data.preferences.home),replace:true});}});
