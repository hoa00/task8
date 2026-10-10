import {createFileRoute,redirect} from '@tanstack/react-router';
import {links} from '../app/navigation';
export const Route=createFileRoute('/_shell/w/$workspaceId/settings/')({beforeLoad:({context})=>{throw redirect({href:links.settings(context.workspaceId),replace:true});}});
