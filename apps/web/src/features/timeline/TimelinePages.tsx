import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Alert, Button, Icon, SegmentedControl, Select, ToastViewport } from '@studio/ui';
import type { ToastMessage } from '@studio/ui';
import { addDateDays, buildTimelineGeometry, normalizeTaskView, rescheduleDateOnly, timelineRange } from '@studio/domain';
import type { TaskViewState, TimelineGrouping, TimelineZoom, WeekStart } from '@studio/domain';
import type { DateOnly, TaskQuery } from '@studio/contracts/api';
import { useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useDataRuntime } from '../../data/context';
import { useStudioQuery } from '../../data/queries';
import { queryKeys } from '../../data/query-keys';
import { invalidateOperation } from '../../data/invalidation';
import { loadTaskViewDataset } from '../tasks/loadTaskViewDataset';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
import { TaskViewToolbar } from '../tasks/TaskViewToolbar';
import { decodeCurrentTaskView, encodeCurrentTaskView } from '../tasks/current-view';
import { TimelineView } from './TimelineView';
import type { TimelineModel, TimelineScope } from './types';

export interface TimelinePanelProps {
  workspaceId: string; scope: TimelineScope; query: TaskQuery;
  zoom: TimelineZoom; grouping: TimelineGrouping; todayRequest: number;
  onTaskOpen: TimelineModel['onTaskOpen']; onTaskMenu?: TimelineModel['onTaskMenu']; onNewTask: TimelineModel['onNewTask'];
  today?: DateOnly; weekStart?: WeekStart;
}
export function TimelinePanel({ workspaceId, scope, query, zoom, grouping, todayRequest, onTaskOpen, onTaskMenu, onNewTask, today: initialToday, weekStart }: TimelinePanelProps) {
  const { client, clock } = useDataRuntime(), cache = useQueryClient(), bootstrap = useStudioQuery('getBootstrap', { workspaceId }), commands = useTaskListCommands(workspaceId), [toasts, setToasts] = useState<ToastMessage[]>([]);
  const scrollPositions = useRef(new Map<string, { left: number; top: number }>());
  const today = initialToday ?? clock.today(), start = weekStart ?? bootstrap.data?.data.preferences.weekStart ?? 1, range = timelineRange(today, zoom, start);
  const scopeQuery = normalizeTaskView({ query: { ...query, ...(scope.kind === 'project' ? { projectId: scope.projectId } : {}), rangeFrom: range.start, rangeTo: range.end, rangeBasis: 'overlap' } }).query;
  const dataset = useQuery({ enabled: !!bootstrap.data, queryKey: [...queryKeys.workspace(workspaceId), 'tasks', 'complete-view', scopeQuery], queryFn: ({ signal }) => loadTaskViewDataset(client, workspaceId, scopeQuery, signal) });
  if (bootstrap.error || dataset.error) return <Alert tone="danger">{(bootstrap.error ?? dataset.error)!.message}</Alert>;
  if (!bootstrap.data || !dataset.data) return <div className="p-6" role="status">Loading timeline…</div>;
  const data = bootstrap.data.data, projects = data.projects.flatMap(row => row.access === 'allowed' && !row.project.archivedAt ? [row.project] : []), scopedProjects = scope.kind === 'project' ? projects.filter(project => project.id === scope.projectId) : projects;
  const geometry = buildTimelineGeometry({ tasks: dataset.data.items, milestones: scopedProjects.flatMap(project => project.milestones), lookups: { members: data.members, projects }, today, weekStart: start, zoom, grouping, ...(scope.kind === 'project' ? { projectId: scope.projectId } : {}) });
  return <><div className="contents" data-timeline-coverage={dataset.data.coverage} data-timeline-count={dataset.data.matchedCount} data-timeline-bars={geometry.bars.length} data-timeline-range={`${range.start}/${range.end}`}><TimelineView model={{ data, geometry, scope, grouping, scrollPositions, zoom, todayRequest, pending: commands.pending, onTaskOpen, ...(onTaskMenu ? { onTaskMenu } : {}), onNewTask, onTaskMove: async (task, days) => {
    if (!task.dueDate || !days) return false;
    const input = { workspaceId, taskId: task.id, body: { expectedVersion: task.version, ...rescheduleDateOnly(task, addDateDays(task.dueDate, days)) } };
    const result = await commands.run('updateTask', input);
    // A real CAS conflict leaves the current Query projection stale. Refetch
    // through the same operation invalidation map before permitting a retry.
    if (!result) { await invalidateOperation(cache, 'updateTask', input); return false; }
    // Locked source pointer drag uses a plain Moved toast; PATCH has no Undo.
    setToasts(current => [{ id: crypto.randomUUID(), message: `Moved “${task.title}” ${Math.abs(days)} day${Math.abs(days) > 1 ? 's' : ''} ${days > 0 ? 'later' : 'earlier'}`, duration: 2200 }, ...current]); return true;
  } }} /></div>{commands.error && <Alert tone="danger">{commands.error}</Alert>}<ToastViewport items={toasts} onDismiss={id => setToasts(current => current.filter(row => row.id !== id))} /></>;
}
export interface TimelinePageProps extends Omit<TimelinePanelProps, 'query' | 'zoom' | 'grouping' | 'todayRequest'> { initialView?: TaskViewState; controlledView?: TaskViewState; initialZoom?: TimelineZoom; initialGrouping?: TimelineGrouping; showHeading?: boolean; onCurrentViewChange?: (view: TaskViewState) => void }
export function TimelinePage({ initialView, controlledView, initialZoom = 'week', initialGrouping, showHeading = true, onCurrentViewChange, ...props }: TimelinePageProps) {
  const bootstrap = useStudioQuery('getBootstrap', { workspaceId: props.workspaceId }), [localView, setView] = useState(initialView ?? decodeCurrentTaskView(location.search)), [zoom, setZoom] = useState(initialZoom), [grouping, setGrouping] = useState<TimelineGrouping>(initialGrouping ?? (props.scope.kind === 'workspace' ? 'project' : 'status')), [todayRequest, setTodayRequest] = useState(0);
  if (!bootstrap.data) return bootstrap.error ? <Alert tone="danger">{bootstrap.error.message}</Alert> : <div className="p-6" role="status">Loading timeline…</div>;
  const view = controlledView ?? localView;
  const data = bootstrap.data.data, projects = data.projects.filter(row => row.access === 'allowed').map(row => row.project);
  function change(next: TaskViewState) { setView(next); if (onCurrentViewChange) { onCurrentViewChange(next); return; } const url = new URL(location.href); url.searchParams.set('view', new URLSearchParams(encodeCurrentTaskView(next)).get('view')!); history.replaceState(history.state, '', url); }
  const controls = <><SegmentedControl label="Timeline zoom" className="ml-1" value={zoom} onValueChange={value => setZoom(value as TimelineZoom)} items={[{ value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }]} /><Select label="Group by" className="ml-1 h-[26px]! w-auto! text-xs!" value={grouping} options={[{ value: 'status', label: 'Group: Status' }, { value: 'assignee', label: 'Group: Assignee' }, { value: 'project', label: 'Group: Project' }, { value: 'none', label: 'No grouping' }]} onValueChange={value => setGrouping(value as TimelineGrouping)} /><Button variant="ghost" size="sm" className="text-xs!" onClick={() => setTodayRequest(value => value + 1)}><Icon name="crosshair" size={14} />Today</Button></>;
  return <main className="task-page" data-timeline-page={props.scope.kind}>{showHeading && <div className="task-page-heading"><div><h1>Timeline</h1><p>Schedules, dependencies, and milestones across projects.</p></div></div>}<TaskViewToolbar value={view} onChange={change} lookups={{ members: data.members, projects, currentMemberId: data.currentMember.id }} group={false} extra={controls} /><TimelinePanel {...props} query={view.query} zoom={zoom} grouping={grouping} todayRequest={todayRequest} /></main>;
}
export function WorkspaceTimeline() {
  const workspaceId = useWorkspaceId(), intents = useWorkspaceIntents(), navigate = useNavigate(), route = useLocation();
  return <TimelinePage controlledView={decodeCurrentTaskView(route.searchStr)} workspaceId={workspaceId} scope={{ kind: 'workspace' }} onCurrentViewChange={view => { void navigate({ to: route.pathname, search: previous => ({ ...previous, view: JSON.stringify(view) }), replace: true }); }} onTaskOpen={intents.openTask} onTaskMenu={intents.openTaskMenu} onNewTask={defaults => intents.openTaskForm(undefined, defaults)} />;
}
