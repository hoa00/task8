import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
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
import { useProjectMotion } from '../projects/project-motion';
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
export function TimelinePanel({ workspaceId, scope, query, zoom, grouping, todayRequest, onTaskOpen, onTaskMenu, onNewTask, today: initialToday, weekStart }: TimelinePanelProps) { useTranslation();
  const { client, clock } = useDataRuntime(), cache = useQueryClient(), bootstrap = useStudioQuery('getBootstrap', { workspaceId }), commands = useTaskListCommands(workspaceId), [toasts, setToasts] = useState<ToastMessage[]>([]);
  const scrollPositions = useRef(new Map<string, { left: number; top: number }>());
  const today = initialToday ?? clock.today(), start = weekStart ?? bootstrap.data?.data.preferences.weekStart ?? 1, range = timelineRange(today, zoom, start);
  const scopeQuery = normalizeTaskView({ query: { ...query, ...(scope.kind === 'project' ? { projectId: scope.projectId } : {}), rangeFrom: range.start, rangeTo: range.end, rangeBasis: 'overlap' } }).query;
  const dataset = useQuery({ enabled: !!bootstrap.data, queryKey: [...queryKeys.workspace(workspaceId), 'tasks', 'complete-view', scopeQuery], queryFn: ({ signal }) => loadTaskViewDataset(client, workspaceId, scopeQuery, signal) });
  if (bootstrap.error || dataset.error) return <Alert tone="danger">{(bootstrap.error ?? dataset.error)!.message}</Alert>;
  if (!bootstrap.data || !dataset.data) return <div className="p-6" role="status">{t("Loading timeline…")}</div>;
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
    setToasts(current => [{ id: crypto.randomUUID(), message: t("Moved “{{value1}}” {{value2}} day{{value3}} {{value4}}", { value1: String(task.title), value2: String(Math.abs(days)), value3: String(Math.abs(days) > 1 ? t('s') : ''), value4: t(days > 0 ? 'later' : 'earlier') }), duration: 2200 }, ...current]); return true;
  } }} /></div>{commands.error && <Alert tone="danger">{commands.error}</Alert>}<ToastViewport items={toasts} onDismiss={id => setToasts(current => current.filter(row => row.id !== id))} /></>;
}
export interface TimelinePageProps extends Omit<TimelinePanelProps, 'query' | 'zoom' | 'grouping' | 'todayRequest'> { initialView?: TaskViewState; controlledView?: TaskViewState; initialZoom?: TimelineZoom; initialGrouping?: TimelineGrouping; showHeading?: boolean; onCurrentViewChange?: (view: TaskViewState) => void }
export function TimelinePage({ initialView, controlledView, initialZoom = 'week', initialGrouping, showHeading = true, onCurrentViewChange, ...props }: TimelinePageProps) { useTranslation();
  const bootstrap = useStudioQuery('getBootstrap', { workspaceId: props.workspaceId }), [localView, setView] = useState(initialView ?? decodeCurrentTaskView(location.search)), [zoom, setZoom] = useState(initialZoom), [grouping, setGrouping] = useState<TimelineGrouping>(initialGrouping ?? (props.scope.kind === 'workspace' ? 'project' : 'status')), [todayRequest, setTodayRequest] = useState(0);
  const { hostRef, onAnimationEnd } = useProjectMotion<HTMLElement>(location.pathname, `${JSON.stringify(controlledView ?? localView)}/${JSON.stringify(bootstrap.data)}`, 'page', `${JSON.stringify(controlledView ?? localView)}/${zoom}/${grouping}/${todayRequest}`, !showHeading ? false : undefined);
  if (!bootstrap.data) return bootstrap.error ? <Alert tone="danger">{bootstrap.error.message}</Alert> : <div className="p-6" role="status">{t("Loading timeline…")}</div>;
  const view = controlledView ?? localView;
  const data = bootstrap.data.data, projects = data.projects.filter(row => row.access === 'allowed').map(row => row.project);
  function change(next: TaskViewState) { setView(next); if (onCurrentViewChange) { onCurrentViewChange(next); return; } const url = new URL(location.href); url.searchParams.set('view', new URLSearchParams(encodeCurrentTaskView(next)).get('view')!); history.replaceState(history.state, '', url); }
  const controls = <><SegmentedControl label={t("Timeline zoom")} className="ml-1" value={zoom} onValueChange={value => setZoom(value as TimelineZoom)} items={[{ value: 'week', label: t("Weeks") }, { value: 'month', label: t("Months") }]} /><Select label={t("Group by")} className="ml-1 h-[26px]! w-auto! text-xs!" value={grouping} options={[{ value: 'status', label: t("Group: Status") }, { value: 'assignee', label: t("Group: Assignee") }, { value: 'project', label: t("Group: Project") }, { value: 'none', label: t("No grouping") }]} onValueChange={value => setGrouping(value as TimelineGrouping)} /><Button variant="ghost" size="sm" className="text-xs!" onClick={() => setTodayRequest(value => value + 1)}><Icon name="crosshair" size={14} />{t("Today")}</Button></>;
  return <main ref={hostRef} onAnimationEnd={onAnimationEnd} data-project-page-motion={showHeading || undefined} className={!showHeading && props.scope.kind === 'project' ? "task-page contents!" : 'task-page'} data-project-view-page={!showHeading && props.scope.kind === 'project' || undefined} data-timeline-page={props.scope.kind}>{showHeading && <div className="task-page-heading"><div><h1>{t("Timeline")}</h1><p>{t("Schedules, dependencies, and milestones across projects.")}</p></div></div>}<TaskViewToolbar value={view} onChange={change} lookups={{ members: data.members, projects, currentMemberId: data.currentMember.id }} group={false} extra={controls} right={props.scope.kind === 'project' ? <Button variant="primary" size="sm" onClick={() => props.onNewTask({})}><Icon name="plus" size={13} />{t("New task")}</Button> : undefined} /><TimelinePanel {...props} query={view.query} zoom={zoom} grouping={grouping} todayRequest={todayRequest} /></main>;
}
export function WorkspaceTimeline() { useTranslation();
  const workspaceId = useWorkspaceId(), intents = useWorkspaceIntents(), navigate = useNavigate(), route = useLocation();
  return <TimelinePage controlledView={decodeCurrentTaskView(route.searchStr)} workspaceId={workspaceId} scope={{ kind: 'workspace' }} onCurrentViewChange={view => { void navigate({ to: route.pathname, search: previous => ({ ...previous, view: JSON.stringify(view) }), replace: true }); }} onTaskOpen={intents.openTask} onTaskMenu={intents.openTaskMenu} onNewTask={defaults => intents.openTaskForm(undefined, defaults)} />;
}
