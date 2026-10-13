import { createFileRoute, redirect } from '@tanstack/react-router';
import { studioQueryOptions } from '../data/queries';
import { StudioApiError } from '../data/errors';
import { WaitingForWorkspace } from '../features/auth/WaitingForWorkspace';
export const Route=createFileRoute('/waiting-for-workspace')({beforeLoad:async({context})=>{
  try { const session=await context.queryClient.ensureQueryData(studioQueryOptions(context.runtime.client,'getSession',{}));if(session.data.currentWorkspaceId)throw redirect({to:'/',replace:true}); }
  catch(error){if(error instanceof StudioApiError&&error.status===401)throw redirect({to:'/login',search:{},replace:true});throw error;}
},component:WaitingForWorkspace});
