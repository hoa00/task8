// WU-07-only browser test fixture. Never part of the main or HTTP production graph.
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {RouterProvider} from '@tanstack/react-router';
import {EntityIdSchema} from '@studio/contracts/api';
import {createMockClient} from './data/adapters/mock';
import {StudioTransportError} from './data/errors';
import {createStudioClient} from './data/operations';
import {fixtureClock} from './data/mock/seed';
import {createStudioQueryClient,studioQueryOptions} from './data/queries';
import {StudioDataProvider} from './data/StudioDataProvider';
import {createStudioRouter} from './app/router';
import {ThemeProvider} from './theme/ThemeProvider';
import {applyRootPreferences,readThemePreferences} from './theme/preferences';
import './styles/app.css';

const original=createMockClient({environment:'test'}),queryClient=createStudioQueryClient();
const session=(await original.api.getSession({})).data,catalog=(await original.api.listWorkspaces({})).data;
const workspaceA=session.currentWorkspaceId,workspaceB=catalog[1]!.id;
const a=(await original.api.getBootstrap({workspaceId:workspaceA})).data;
const memberId=EntityIdSchema.parse('019f4800-0000-7000-8000-000000000001');
const b={...a,workspace:catalog[1]!,currentMember:{...a.currentMember,id:memberId,workspaceId:workspaceB},members:[{id:memberId,name:a.currentMember.name,avatarColor:a.currentMember.avatarColor}],projects:[],teams:[],unreadCount:0,navigationCounts:{inbox:0,myTasks:0,archive:0}};
let delayOld=false,releaseOld:(()=>void)|undefined,aborted=false;
let bootstrapScenario:'ready'|'loading'|'error'='ready',releaseBootstrap:(()=>void)|undefined;
const client=createStudioClient(async(id,input,options)=>{
 if(id==='getBootstrap' && input.workspaceId===workspaceB){if(bootstrapScenario==='loading')await new Promise<void>(resolve=>{releaseBootstrap=resolve;});if(bootstrapScenario==='error')throw new StudioTransportError('offline','Test bootstrap offline');return {data:b};}
 if(id==='getBootstrap' && input.workspaceId===workspaceA && delayOld){delayOld=false;options.signal?.addEventListener('abort',()=>{aborted=true;},{once:true});await new Promise<void>(resolve=>{releaseOld=resolve;});return {data:{...a,workspace:{...a.workspace,name:'STALE A'}}};}
 return original.execute(id,input as never,options);
});
const router=createStudioRouter({runtime:{client,clock:fixtureClock},queryClient});
const controls={workspaceA,workspaceB,setBootstrapScenario:(scenario:'ready'|'loading'|'error')=>{bootstrapScenario=scenario;queryClient.removeQueries({queryKey:studioQueryOptions(client,'getBootstrap',{workspaceId:workspaceB}).queryKey});},releaseBootstrap:()=>{bootstrapScenario='ready';releaseBootstrap?.();},navigate:(href:string)=>router.navigate({href}),
 delayOldResponse:()=>{delayOld=true;void queryClient.refetchQueries({queryKey:studioQueryOptions(client,'getBootstrap',{workspaceId:workspaceA}).queryKey});},
 releaseOldResponse:()=>releaseOld?.(),inspect:()=>({aborted,queryKeys:queryClient.getQueryCache().getAll().map(query=>query.queryKey),oldData:queryClient.getQueryData(studioQueryOptions(client,'getBootstrap',{workspaceId:workspaceA}).queryKey),matches:router.state.matches.map(match=>match.routeId),scope:router.options.context?.navigation.workspaceId})};
Object.assign(window,{__shellHarness:controls});
applyRootPreferences(readThemePreferences());
const root=document.getElementById('root');if(!root)throw Error('Missing shell test root');
createRoot(root).render(<StrictMode><ThemeProvider><StudioDataProvider runtime={{client,clock:fixtureClock}} queryClient={queryClient}><RouterProvider router={router}/></StudioDataProvider></ThemeProvider></StrictMode>);
