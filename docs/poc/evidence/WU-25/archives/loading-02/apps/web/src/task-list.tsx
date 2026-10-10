import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, OverlayProvider } from '@studio/ui';
import type { OperationInput, ProjectDto } from '@studio/contracts/api';
import { StudioDataProvider } from './data/StudioDataProvider';
import { createStudioQueryClient, studioQueryOptions, useStudioQuery } from './data/queries';
import { createMockClient } from './data/adapters/mock';
import { createStudioClient } from './data/operations';
import { StudioApiError } from './data/errors';
import { fixtureClock } from './data/mock/seed';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyRootPreferences, readThemePreferences } from './theme/preferences';
import { TaskMiniRow } from './features/tasks/TaskMiniRow';
import { useTaskListCommands } from './features/tasks/useTaskListCommands';
import { TaskListPage } from './features/tasks/TaskListPages';
import type { TaskListScope, TaskListUiState } from './features/tasks/list-types';
import './styles/app.css';
applyRootPreferences(readThemePreferences());
const raw = createMockClient({ environment: 'test', scenario: new URLSearchParams(location.search).get('empty') === '1' ? 'empty' : 'populated' }); let failNext = false;
const client = createStudioClient(async (id, input, options) => { if (failNext && ['createTask', 'updateTask', 'updateSubtask', 'bulkMutateTasks', 'moveTask'].includes(id)) { failNext = false; throw new StudioApiError({ error: { code: 'CONFLICT', message: 'The task changed. Review and try again.' } }); } return raw.execute(id, input as OperationInput<typeof id>, options); });
const queryClient = createStudioQueryClient();
declare global { interface Window { __taskListQA: { client: typeof client; queryClient: typeof queryClient; failNext(): void } } }
window.__taskListQA = { client, queryClient, failNext: () => { failNext = true; } };
export function Harness() {
 const session = useStudioQuery('getSession', {}), [selected, setSelected] = useState<readonly string[]>(()=>JSON.parse(new URLSearchParams(location.search).get('selectedIds') ?? '[]') as string[]), [opened, setOpened] = useState('');
 const rows = useStudioQuery('listTasks', {workspaceId: session.data?.data.currentWorkspaceId ?? '019a6257-0480-7000-8000-000000000001', query:{limit:200}}), commands=useTaskListCommands(session.data?.data.currentWorkspaceId ?? '019a6257-0480-7000-8000-000000000001');
 const bootstrap = useStudioQuery('getBootstrap', { workspaceId: session.data?.data.currentWorkspaceId ?? '019a6257-0480-7000-8000-000000000001' });
 if (!session.data || !bootstrap.data || !rows.data) return <div>Loading…</div>;
 const params = new URLSearchParams(location.search), kind = params.get('scope') ?? 'workspace', project = bootstrap.data.data.projects.find(item => item.access === 'allowed')?.project;
 const scope: TaskListScope = kind === 'project' ? { kind, projectId: project?.id ?? session.data.data.currentWorkspaceId } : kind === 'saved' ? { kind, projectId: project?.id ?? session.data.data.currentWorkspaceId, savedViewId: project?.id ?? session.data.data.currentWorkspaceId } : { kind: kind === 'mine' ? 'mine' : 'workspace' };
 if(params.get('mini')==='1')return <section id="task-mini-sample">{rows.data.data.items.filter(task=>['WEB-112','WEB-130','WEB-127'].includes(task.key)).map(task=><TaskMiniRow key={task.id} today={fixtureClock.today()} task={task} project={bootstrap.data.data.projects.find(item=>item.project.id===task.projectId)!.project as ProjectDto} member={bootstrap.data.data.members.find(member=>member.id===task.assigneeId)??null} showProject={params.get('noProject')!=='1'} showAvatar={params.get('noAvatar')!=='1'} onOpen={setOpened} onComplete={task=>{void commands.run('setTaskCompletion',{workspaceId:task.workspaceId,taskId:task.id,body:{expectedVersion:task.version,completed:task.status!=='done'}});}} />)}</section>;
 return <>{params.get('visual') !== '1' && <Button onClick={() => { failNext = true; }}>Fail next mutation</Button>}<TaskListPage initialListState={JSON.parse(params.get('listState') ?? '{}') as TaskListUiState} showHeading={!(params.get('visual') === '1' && (scope.kind === 'project' || scope.kind === 'saved'))} workspaceId={session.data.data.currentWorkspaceId} scope={scope} selectedIds={selected} onSelectionChange={setSelected} onTaskOpen={setOpened} onTitleEdit={() => setOpened('')} /><output data-open-task hidden>{opened}</output></>;
}
const initial = JSON.parse(new URLSearchParams(location.search).get('listState') ?? '{}') as TaskListUiState;
if (initial.expandedTaskIds?.length) { const session = await queryClient.fetchQuery(studioQueryOptions(client,'getSession',{})); await Promise.all(initial.expandedTaskIds.map(taskId => queryClient.fetchQuery(studioQueryOptions(client,'getTask',{workspaceId:session.data.currentWorkspaceId,taskId})))); }
// The isolated source section has an auto-sized block parent; mirror that QA host.
if (new URLSearchParams(location.search).get('visual') === '1') { const style = document.createElement('style'); style.textContent = '#root { height: auto; }'; document.head.append(style); }
const root = document.getElementById('root'); if (!root) throw new Error('Missing task list root');
createRoot(root).render(<StrictMode><ThemeProvider><StudioDataProvider runtime={{ client, clock: fixtureClock }} queryClient={queryClient}><OverlayProvider><Harness /></OverlayProvider></StudioDataProvider></ThemeProvider></StrictMode>);
