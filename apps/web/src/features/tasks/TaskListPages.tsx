import { useRef, useState } from 'react';
import { Alert, Button, Icon, SegmentedControl } from '@studio/ui';
import { addDateDays, evaluateTaskView, normalizeTaskView } from '@studio/domain';
import type { TaskViewState } from '@studio/domain';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useDataRuntime } from '../../data/context';
import { useStudioQuery } from '../../data/queries';
import { useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useTaskListDataset } from './useTaskListDataset';
import { TaskList } from './TaskList';
import { TaskBoard } from './TaskBoard';
import { useTaskBoardDataset } from './useTaskBoardDataset';
import type { TaskBoardComposerHandle } from './TaskBoard';
import type { TaskBoardUiState } from './board-types';
import type { TaskListComposerHandle } from './TaskList';
import { TaskViewToolbar } from './TaskViewToolbar';
import { decodeCurrentTaskView, encodeCurrentTaskView } from './current-view';
import type { ListGroup, TaskListScope, TaskListUiState, TaskListModel } from './list-types';
function useCurrentViewChange() { const location = useLocation(), navigate = useNavigate(); return (view: TaskViewState) => { void navigate({ to: location.pathname, search: previous => ({ ...previous, view: JSON.stringify(view) }), replace: true }); }; }
function useCurrentMode() { const location=useLocation(),navigate=useNavigate();return {controlledMode:new URLSearchParams(location.searchStr).get('mode') === 'board' ? 'board' as const : 'list' as const,onModeChange:(mode:'list'|'board')=>{void navigate({to:location.pathname,search:previous=>({...previous,mode}),replace:true});}}; }
export function WorkspaceTasks() { const currentMode=useCurrentMode(); const workspaceId = useWorkspaceId(), intents = useWorkspaceIntents(), onCurrentViewChange = useCurrentViewChange(); return <TaskListPage workspaceId={workspaceId} scope={{ kind: 'workspace' }} selectedIds={intents.selectedTaskIds} onSelectionChange={intents.selectTasks} onTaskOpen={intents.openTask} onTitleEdit={intents.closeTask} onNewTask={() => intents.openTaskForm()} onTaskMenu={intents.openTaskMenu} onTaskEdit={id => intents.openTaskForm(id)} onCurrentViewChange={onCurrentViewChange} {...currentMode} />; }
export function MyTasksList() { const workspaceId = useWorkspaceId(), intents = useWorkspaceIntents(), onCurrentViewChange = useCurrentViewChange(); return <TaskListPage workspaceId={workspaceId} scope={{ kind: 'mine' }} selectedIds={[]} onSelectionChange={() => {}} onTaskOpen={intents.openTask} onTitleEdit={intents.closeTask} onNewTask={() => intents.openTaskForm()} onTaskMenu={intents.openTaskMenu} onTaskEdit={id => intents.openTaskForm(id)} onCurrentViewChange={onCurrentViewChange} />; }
export interface TaskListPageProps { workspaceId: string; scope: TaskListScope; selectedIds: readonly string[]; onSelectionChange: (ids: readonly string[]) => void; onTaskOpen: (id: string) => void; onTitleEdit?: () => void; initialView?: TaskViewState; showHeading?: boolean; initialListState?: TaskListUiState | undefined; onCurrentViewChange?: (view: TaskViewState) => void; onNewTask?: () => void; onTaskMenu?: TaskListModel['onTaskMenu']; onTaskEdit?: (id: string) => void; onModeChange?: (mode: 'list' | 'board') => void; controlledMode?: 'list' | 'board'; initialMode?: 'list' | 'board'; initialBoardState?: TaskBoardUiState }
export function TaskListPage({ workspaceId, scope, selectedIds, onSelectionChange, onTaskOpen, onTitleEdit = () => {}, initialView, showHeading = true, initialListState, onCurrentViewChange, onNewTask, onTaskMenu, onTaskEdit, onModeChange, controlledMode, initialMode, initialBoardState }: TaskListPageProps) {
 const { clock } = useDataRuntime(), bootstrap = useStudioQuery('getBootstrap', { workspaceId });
 const composer = useRef<TaskListComposerHandle>(null), boardComposer = useRef<TaskBoardComposerHandle>(null);
 const [localMode, setMode] = useState<'list' | 'board'>(() => scope.kind === 'mine' ? 'list' : initialMode ?? (new URLSearchParams(location.search).get('mode') === 'board' ? 'board' : 'list'));
 const [view, setView] = useState(() => initialView ?? decodeCurrentTaskView(location.search));
 const mode = controlledMode ?? localMode;
 const mine = scope.kind === 'mine', project = scope.kind === 'project' || scope.kind === 'saved';
 const query = normalizeTaskView({ query: { ...view.query, ...(project ? { projectId: scope.projectId } : {}), ...(mine && bootstrap.data ? { assigneeId: bootstrap.data.data.currentMember.id, ...(view.query.sortField === 'manual' ? { sortField: 'due' } : {}) } : {}) } }).query;
 const dataset = useTaskListDataset(workspaceId, query);
 const columnQuery = normalizeTaskView({query:{...(project ? {projectId:scope.projectId} : {})}}).query;
 const columnsDataset = useTaskBoardDataset(workspaceId, columnQuery, mode === 'board');
 if (bootstrap.error || dataset.error || columnsDataset.error) return <Alert tone="danger">{(bootstrap.error ?? dataset.error ?? columnsDataset.error)!.message}</Alert>;
 if (!bootstrap.data || !dataset.data || (mode === 'board' && !columnsDataset.data)) return <div className="p-6" role="status">Loading tasks…</div>;
 const data = bootstrap.data.data, tasks = dataset.data, projects = data.projects.filter(item => item.access === 'allowed').map(item => item.project), env = { today: clock.today(), now: Date.parse(clock.now()), lookups: { members: data.members, projects } };
 const evaluated = evaluateTaskView(tasks, { ...view, query }, env);
 const groups: readonly ListGroup[] = mine ? [
 { key: 'overdue', name: 'Overdue', taskIds: tasks.filter(task => task.status !== 'done' && task.dueDate && task.dueDate < clock.today()).map(task => task.id) },
 { key: 'today', name: 'Today', taskIds: tasks.filter(task => task.status !== 'done' && task.dueDate === clock.today()).map(task => task.id), createPatch: { dueDate: clock.today() } },
 { key: 'upcoming', name: 'Upcoming', taskIds: tasks.filter(task => task.status !== 'done' && (!task.dueDate || task.dueDate > clock.today())).map(task => task.id), createPatch: { dueDate: addDateDays(clock.today(), 3) } },
 { key: 'completed', name: 'Completed', taskIds: tasks.filter(task => task.status === 'done').map(task => task.id), createPatch: { status: 'done' }, collapsed: true },
 ] : evaluated.groups;
 function changeMode(next: string) {if(next !== 'list' && next !== 'board')return;setMode(next);if(onModeChange)onModeChange(next);else {const url=new URL(location.href);url.searchParams.set('mode',next);history.replaceState(history.state,'',url);}}
 function change(next: TaskViewState) { setView(next); if (onCurrentViewChange) { onCurrentViewChange(next); return; } const url = new URL(location.href); url.searchParams.set('view', new URLSearchParams(encodeCurrentTaskView(next)).get('view')!); history.replaceState(history.state, '', url); }
 const title = mine ? 'My Tasks' : project ? scope.kind === 'saved' ? 'Saved List' : 'Project List' : 'Tasks';
 return <main className="task-page" data-list-scope={scope.kind} aria-busy={dataset.isFetching} data-query-coverage={dataset.isPlaceholderData ? 'pending' : 'complete'}>{showHeading && <div className="task-page-heading"><div><h1>{title}</h1><p>{mine ? `${groups[1]!.taskIds.length} due today · ${groups[0]!.taskIds.length} overdue · ${groups[2]!.taskIds.length} upcoming` : project ? 'Feature harness · full Project wrapper pending WU-16' : `Every task across ${projects.length} projects.`}</p></div><div className="task-page-actions">{mine && <SegmentedControl label="View" value="list" items={[{ value: 'list', label: 'List', icon: <Icon name="list" size={13} /> }, { value: 'calendar', label: 'Calendar', icon: <Icon name="calendar" size={13} />, disabled: true }]} onValueChange={() => {}} />}<Button variant="primary" disabled={!projects.length} onClick={() => onNewTask ? onNewTask() : mode === 'board' ? boardComposer.current?.begin() : composer.current?.begin()}><Icon name="plus" size={14} />New task</Button></div></div>}
 <TaskViewToolbar value={view} onChange={change} lookups={{ members: data.members, projects, currentMemberId: data.currentMember.id }} group={!mine && mode !== 'board'} right={!mine && !project ? <SegmentedControl label="Task view" value={mode} items={[{ value: 'list', label: <span className="task-hide-mobile">List</span>, icon: <Icon name="list" size={13} /> }, { value: 'board', label: <span className="task-hide-mobile">Board</span>, icon: <Icon name="square-kanban" size={13} /> }, { value: 'table', label: <span className="task-hide-mobile">Table</span>, icon: <Icon name="table-2" size={13} />, disabled: true }]} onValueChange={changeMode} /> : undefined} />
 {mode === 'board' && scope.kind !== 'mine' ? <TaskBoard ref={boardComposer} initialState={initialBoardState} model={{scope,data,tasks,columnTasks:columnsDataset.data!.items,query,onTaskOpen,onTaskEdit:onTaskEdit ?? onTaskOpen,onTaskMenu:onTaskMenu ?? ((id) => onTaskOpen(id))}} /> : <div className="task-list-wrap"><TaskList ref={composer} initialState={initialListState} model={{ scope, data, tasks, groups, view, onViewChange: change, selection: { kind: mine ? 'completion' : 'bulk', selectedIds, onChange: onSelectionChange }, onTaskOpen, onTitleEdit, ...(onTaskMenu ? { onTaskMenu } : {}) }} columns={mine ? ['project', 'status', 'priority', 'due'] : ['status', 'assignee', 'priority', 'due', project ? 'labels' : 'project']} /></div>}</main>;
}
