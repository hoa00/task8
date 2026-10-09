import { useEffect,useRef,useState,useSyncExternalStore } from 'react';
import { Outlet,useLocation,useNavigate,useRouter,useRouterState,isNotFound } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { OverlayProvider } from '@studio/ui';
import { ProjectOverlayHost } from '../../features/projects/ProjectOverlayHost';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileNavigation } from './MobileNavigation';
import { ContentViewport } from './ContentViewport';
import { WorkspaceContext,useWorkspaceBootstrap } from './workspace-context';
import { WorkspaceTransientContext } from './transient-context';
import { cancelWorkspaceQueries } from '../../data/invalidation';
import { EntityIdSchema } from '@studio/contracts/api';
import { pageNames,validateRouteSearch } from '../navigation';
import { TaskOverlayHost } from '../../features/tasks/detail/TaskOverlayHost';
import type { TaskFormIntent, TaskMenuIntent } from '../../features/tasks/detail/TaskOverlayHost';
import { links } from '../navigation';
import { LoadingBoundary } from './Boundaries';

export interface AppShellProps { workspaceId: string }
function subscribeMobile(callback:()=>void){const media=matchMedia('(max-width: 900px)');media.addEventListener('change',callback);return ()=>media.removeEventListener('change',callback);}
function readCollapsed():boolean {try{return localStorage.getItem('task8.ui.shell.v1')==='collapsed';}catch{return false;}}
export function AppShell({workspaceId}:AppShellProps) {return <WorkspaceContext value={workspaceId}><WorkspaceShell workspaceId={workspaceId}/></WorkspaceContext>;}
function WorkspaceShell({workspaceId}:AppShellProps) {
 const queryClient=useQueryClient(),router=useRouter(),navigate=useNavigate();
 const mobile=useSyncExternalStore(subscribeMobile,()=>matchMedia('(max-width: 900px)').matches,()=>false);
 const location=useLocation();
 const loading=useRouterState({select:state=>state.isLoading});
 const notFound=useRouterState({select:state=>state.matches.some(match=>match.status==='notFound'||isNotFound(match.error))});
 const data=useWorkspaceBootstrap().data?.data;
 const [collapsed,setCollapsed]=useState(readCollapsed),[mobileOpen,setMobileOpen]=useState(false);
 const [selection,setSelection]=useState<{workspaceId:string;ids:readonly string[]}>({workspaceId,ids:[]});
 const opener=useRef<HTMLButtonElement>(null),nav=useRef<HTMLElement>(null),priorWorkspace=useRef(workspaceId),mobileOpener=useRef<HTMLElement|null>(null);
 const returnNavigationFocus=()=>requestAnimationFrame(()=>{(mobileOpener.current?.isConnected?mobileOpener.current:opener.current)?.focus();});
 const openNavigation=()=>{mobileOpener.current=document.activeElement as HTMLElement;setMobileOpen(true);};
 const closeNavigation=()=>{setMobileOpen(false);returnNavigationFocus();};
 const search=validateRouteSearch(location.search);
 const taskOpener=useRef<HTMLElement|null>(null),[form,setForm]=useState<TaskFormIntent>({open:false,generation:0}),[taskMenu,setTaskMenu]=useState<TaskMenuIntent|null>(null);
 const closeTask=()=>{void navigate({to:location.pathname,search:previous=>{const next={...previous};delete next.taskId;return next;},replace:true});};
 const openTask=(taskId:string)=>{EntityIdSchema.parse(taskId);if(!search.taskId){const focused=document.activeElement;taskOpener.current=focused instanceof HTMLElement&&focused!==document.body?focused:document.getElementById('main-content');}void navigate({to:location.pathname,search:previous=>({...previous,taskId})});};
 useEffect(()=>{if(priorWorkspace.current!==workspaceId){void cancelWorkspaceQueries(queryClient,priorWorkspace.current);priorWorkspace.current=workspaceId;}},[queryClient,workspaceId]);
 useEffect(()=>router.subscribe('onBeforeNavigate',event=>{
   const destination=event.toLocation.pathname.match(/^\/w\/([^/]+)/)?.[1] ?? validateRouteSearch(event.toLocation.search).workspaceId ?? workspaceId;
   if(destination!==workspaceId){void cancelWorkspaceQueries(queryClient,workspaceId);setSelection({workspaceId:destination,ids:[]});}
   setMobileOpen(false);
 }),[router,queryClient,workspaceId]);
 useEffect(()=>{
   const segment=location.pathname.split('/')[3]??location.pathname.split('/').at(-1)??'';
   const project=segment==='projects'?data?.projects.find(item=>location.pathname.includes(item.project.id)):undefined;
   const title=`${notFound?'Not found':project?.project.name??pageNames[segment]??'Not found'} · Gr8r Studio`;
   document.title=title;document.getElementById('sr-live')!.textContent=title.replace(' · Gr8r Studio','');
 },[location.pathname,data,notFound]);
 useEffect(()=>{if(!mobileOpen)return;nav.current?.querySelector<HTMLElement>('button,a')?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setMobileOpen(false);requestAnimationFrame(()=>{(mobileOpener.current?.isConnected?mobileOpener.current:opener.current)?.focus();});}if(event.key==='Tab'){const items=[...nav.current!.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[mobileOpen]);
 useEffect(()=>{const media=matchMedia('(max-width: 900px)');const resize=()=>{if(!media.matches)setMobileOpen(false);};media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);},[]);
 const toggleCollapsed=(value:boolean)=>{setCollapsed(value);try{localStorage.setItem('task8.ui.shell.v1',value?'collapsed':'expanded');}catch{/* preference is optional */}};
 if(!data)return <LoadingBoundary/>;
 return <WorkspaceTransientContext value={{selectedTaskIds:selection.workspaceId===workspaceId?selection.ids:[],selectTasks:ids=>setSelection({workspaceId,ids}),openTask,closeTask,openTaskForm:(taskId,defaults)=>setForm(current=>taskId?{open:true,taskId,generation:current.generation+1}:{open:true,generation:current.generation,...(defaults?{defaults}:{})}),openTaskMenu:(taskId,anchor,point)=>setTaskMenu({taskId,anchor,...(point?{point}:{})})}}><OverlayProvider><ProjectOverlayHost key={workspaceId} data={data} onOpenOverlay={() => { setMobileOpen(false); return mobileOpen ? opener.current : null; }}>
 <button className="shell-skip fixed left-3 -top-[60px] z-[300] rounded-sm bg-foreground px-3 py-2 text-sm font-medium text-[var(--text-inv)] transition-[top]" onClick={()=>document.getElementById('main-content')?.focus()}>Skip to content</button>
 <div className="shell-layout grid h-full grid-cols-[var(--side-w)_minmax(0,1fr)]" data-collapsed={collapsed||undefined} data-mobile-open={mobileOpen||undefined} data-workspace-id={workspaceId}>
  <Sidebar collapsed={collapsed} onCollapsedChange={toggleCollapsed} navigationRef={nav} mobileClosed={mobile&&!mobileOpen}/>{mobileOpen && <button tabIndex={-1} className="shell-scrim fixed inset-0 z-[69] bg-[var(--overlay)]" aria-label="Close navigation" onClick={closeNavigation}/>}
  <main className="relative flex min-h-0 min-w-0 flex-col bg-surface" id="main" inert={mobileOpen || undefined}><Topbar onOpenNavigation={openNavigation} openerRef={opener}/><ContentViewport><Outlet/></ContentViewport>{loading && <div className="absolute inset-x-0 bottom-0 top-[var(--topbar-h)] z-[4] bg-surface"><LoadingBoundary/></div>}</main>
  <MobileNavigation onOpenNavigation={openNavigation}/>
 </div><div className="sr-only [margin:0]" id="sr-live" aria-live="polite" aria-atomic="true"/><div data-task-overlay-slot data-task-id={search.taskId} data-workspace-id={workspaceId}/><TaskOverlayHost key={workspaceId} data={data} {...(search.taskId?{taskId:search.taskId}:{})} onTaskOpen={openTask} onTaskClose={closeTask} opener={taskOpener} form={form} onFormChange={setForm} menu={taskMenu} onMenuChange={setTaskMenu} onProjectOpen={projectId=>{closeTask();void navigate({to:links.project(workspaceId,projectId)});}}/>
 </ProjectOverlayHost></OverlayProvider></WorkspaceTransientContext>;
}
