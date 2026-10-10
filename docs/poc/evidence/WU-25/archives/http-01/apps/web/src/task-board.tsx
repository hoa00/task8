import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, OverlayProvider } from '@studio/ui';
import type { OperationInput } from '@studio/contracts/api';
import { StudioDataProvider } from './data/StudioDataProvider';
import { createStudioQueryClient, useStudioQuery } from './data/queries';
import { createMockClient } from './data/adapters/mock';
import { createStudioClient } from './data/operations';
import { StudioApiError } from './data/errors';
import { browserMockStorage } from './data/mock/persistence';
import { fixtureClock } from './data/mock/seed';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyRootPreferences, readThemePreferences } from './theme/preferences';
import { TaskListPage } from './features/tasks/TaskListPages';
import type { TaskListScope } from './features/tasks/list-types';
import type { TaskBoardUiState } from './features/tasks/board-types';
import { TaskOverlayHost } from './features/tasks/detail/TaskOverlayHost';
import type { TaskFormIntent, TaskMenuIntent } from './features/tasks/detail/TaskOverlayHost';
import './styles/app.css';
applyRootPreferences(readThemePreferences());
const storage=browserMockStorage();
const raw = createMockClient({ ...(storage?{storage}:{}), environment: 'test', scenario: new URLSearchParams(location.search).get('empty') === '1' ? 'empty' : 'populated' }); let failNext = false, holdNextCreate = false, releaseCreate: (() => void) | null = null; const calls: string[] = [];
const client = createStudioClient(async (id, input, options) => { calls.push(id); if(id==='createTask'&&holdNextCreate){holdNextCreate=false;await new Promise<void>(resolve=>{releaseCreate=resolve;});releaseCreate=null;} if (failNext && ['createTask', 'updateTask', 'updateSubtask', 'bulkMutateTasks', 'moveTask'].includes(id)) { failNext = false; throw new StudioApiError({ error: { code: 'CONFLICT', message: 'The task changed. Review and try again.' } }); } return raw.execute(id, input as OperationInput<typeof id>, options); });
const queryClient = createStudioQueryClient();
declare global { interface Window { __taskBoardQA: { client: typeof client; queryClient: typeof queryClient; failNext(): void; holdNextCreate(): void; releaseCreate(): void; calls: string[] } } }
window.__taskBoardQA = { client, queryClient, calls, failNext: () => { failNext = true; }, holdNextCreate:()=>{holdNextCreate=true;}, releaseCreate:()=>releaseCreate?.() };
export function Harness() {
 const opener=useRef<HTMLElement|null>(null),[form,setForm]=useState<TaskFormIntent>({open:false,generation:0}),[menu,setMenu]=useState<TaskMenuIntent|null>(null);
 const session = useStudioQuery('getSession', {}), [selected, setSelected] = useState<readonly string[]>(()=>JSON.parse(new URLSearchParams(location.search).get('selectedIds') ?? '[]') as string[]), [opened, setOpened] = useState('');
 const rows = useStudioQuery('listTasks', {workspaceId: session.data?.data.currentWorkspaceId ?? '019a6257-0480-7000-8000-000000000001', query:{limit:200}});
 const bootstrap = useStudioQuery('getBootstrap', { workspaceId: session.data?.data.currentWorkspaceId ?? '019a6257-0480-7000-8000-000000000001' });
 if (!session.data || !bootstrap.data || !rows.data) return <div>Loading…</div>;
 const params = new URLSearchParams(location.search), kind = params.get('scope') ?? 'workspace', project = bootstrap.data.data.projects.find(item => item.access === 'allowed')?.project;
 const scope: TaskListScope = kind === 'project' ? { kind, projectId: project?.id ?? session.data.data.currentWorkspaceId } : kind === 'saved' ? { kind, projectId: project?.id ?? session.data.data.currentWorkspaceId, savedViewId: project?.id ?? session.data.data.currentWorkspaceId } : { kind: kind === 'mine' ? 'mine' : 'workspace' };
 return <>{params.get('visual') !== '1' && <Button onClick={() => { failNext = true; }}>Fail next mutation</Button>}<TaskListPage initialMode="board" initialBoardState={JSON.parse(params.get('boardState') ?? '{}') as TaskBoardUiState} showHeading={!(params.get('visual') === '1' && (scope.kind === 'project' || scope.kind === 'saved'))} workspaceId={session.data.data.currentWorkspaceId} scope={scope} selectedIds={selected} onSelectionChange={setSelected} onTaskOpen={id=>{opener.current=document.activeElement as HTMLElement;setOpened(id);}} onTitleEdit={() => setOpened('')} onTaskEdit={id=>setForm({open:true,taskId:id,generation:form.generation+1})} onTaskMenu={(taskId,anchor,point)=>setMenu({taskId,anchor,...(point?{point}:{})})} onNewTask={()=>setForm({open:true,generation:form.generation+1})} /><TaskOverlayHost data={bootstrap.data.data} {...(opened?{taskId:opened}:{})} onTaskOpen={setOpened} onTaskClose={()=>setOpened('')} opener={opener} form={form} onFormChange={setForm} menu={menu} onMenuChange={setMenu} onProjectOpen={()=>setOpened('')} /><output data-open-task hidden>{opened}</output></>;
}
const root = document.getElementById('root'); if (!root) throw new Error('Missing task list root');
createRoot(root).render(<StrictMode><ThemeProvider><StudioDataProvider runtime={{ client, clock: fixtureClock }} queryClient={queryClient}><OverlayProvider><Harness /></OverlayProvider></StudioDataProvider></ThemeProvider></StrictMode>);
