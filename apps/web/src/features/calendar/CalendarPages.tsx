import { useCalendarRouteState } from '../../app/useCalendarRouteState';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Alert, Button, Icon, ToastViewport } from '@studio/ui';
import type { ToastMessage } from '@studio/ui';
import { buildCalendarCells, normalizeTaskView, rescheduleDateOnly } from '@studio/domain';
import type { CalendarMode, TaskViewState, WeekStart } from '@studio/domain';
import type { DateOnly, TaskQuery } from '@studio/contracts/api';
import { useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { links } from '../../app/navigation';
import { useDataRuntime } from '../../data/context';
import { useProjectMotion } from '../projects/project-motion';
import { useStudioQuery } from '../../data/queries';
import { queryKeys } from '../../data/query-keys';
import { loadTaskViewDataset } from '../tasks/loadTaskViewDataset';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
import { TaskViewToolbar } from '../tasks/TaskViewToolbar';
import { decodeCurrentTaskView } from '../tasks/current-view';
import { calendarDateLabel } from './date-format';
import { CalendarView } from './CalendarView';
import type { CalendarModel, CalendarScope } from './types';

export interface CalendarPanelProps {
  workspaceId: string;
  scope: CalendarScope;
  query: TaskQuery;
  onTaskOpen: CalendarModel['onTaskOpen'];
  onTaskMenu?: CalendarModel['onTaskMenu'];
  onNewTask: CalendarModel['onNewTask'];
  onProjectOpen: CalendarModel['onProjectOpen'];
  controlledDate?: DateOnly;
  controlledCalendarMode?: CalendarMode;
  onDateChange?: (date: DateOnly) => void;
  onCalendarModeChange?: (mode: CalendarMode) => void;
  initialDate?: DateOnly;
  initialMode?: CalendarMode;
  weekStart?: WeekStart;
}
export function CalendarPanel({
  workspaceId,
  scope,
  query,
  onTaskOpen,
  onTaskMenu,
  onNewTask,
  onProjectOpen,
  initialDate,
  controlledDate,
  controlledCalendarMode,
  onDateChange,
  onCalendarModeChange,
  initialMode = 'month',
  weekStart,
}: CalendarPanelProps) {
  useTranslation();
  const { client, clock } = useDataRuntime(),
    bootstrap = useStudioQuery('getBootstrap', { workspaceId }),
    commands = useTaskListCommands(workspaceId);
  const [localDate, setDate] = useState(initialDate ?? clock.today()),
    [localMode, setMode] = useState<CalendarMode>(initialMode),
    [toasts, setToasts] = useState<ToastMessage[]>([]);
  const date = controlledDate ?? localDate,
    mode = controlledCalendarMode ?? localMode;
  const cells = buildCalendarCells(
    date,
    mode,
    weekStart ?? bootstrap.data?.data.preferences.weekStart ?? 1,
    clock.today(),
  );
  const range = { from: cells[0]!.date, to: cells.at(-1)!.date };
  const scopeQuery = normalizeTaskView({
    query: {
      ...query,
      ...(scope.kind === 'project' ? { projectId: scope.projectId } : {}),
      ...(scope.kind === 'mine' && bootstrap.data
        ? { assigneeId: bootstrap.data.data.currentMember.id }
        : {}),
    },
  }).query;
  const scopedQuery = {
    ...scopeQuery,
    rangeFrom: range.from,
    rangeTo: range.to,
    rangeBasis: 'due' as const,
  };
  const dataset = useQuery({
    enabled: !!bootstrap.data,
    queryKey: [...queryKeys.workspace(workspaceId), 'tasks', 'complete-view', scopedQuery],
    queryFn: ({ signal }) => loadTaskViewDataset(client, workspaceId, scopedQuery, signal),
  });
  // Source legend uses all filtered scope tasks, even outside the visible dates.
  // Share the same complete loader/cache; range data alone owns chips/overflow.
  const legend = useQuery({
    enabled: !!bootstrap.data,
    queryKey: [...queryKeys.workspace(workspaceId), 'tasks', 'complete-view', scopeQuery],
    queryFn: ({ signal }) => loadTaskViewDataset(client, workspaceId, scopeQuery, signal),
  });
  const events = useQuery({
    enabled: scope.kind !== 'mine',
    queryKey: [...queryKeys.workspace(workspaceId), 'events', range, scopeQuery.projectId],
    queryFn: ({ signal }) =>
      client.execute(
        'listCalendarEvents',
        {
          workspaceId,
          query: { ...range, ...(scopeQuery.projectId ? { projectId: scopeQuery.projectId } : {}) },
        },
        { signal },
      ),
  });
  if (bootstrap.error || dataset.error || legend.error || events.error)
    return (
      <Alert tone="danger">
        {(bootstrap.error ?? dataset.error ?? legend.error ?? events.error)!.message}
      </Alert>
    );
  if (!bootstrap.data || !dataset.data || !legend.data || (scope.kind !== 'mine' && !events.data))
    return (
      <div className="p-6" role="status">
        {t('Loading calendar…')}
      </div>
    );
  const data = bootstrap.data.data;
  const visibleEvents = (scope.kind === 'mine' ? [] : events.data!.data).filter((event) =>
    scopeQuery.filters
      .filter((filter) => filter.field === 'project' && filter.values.length)
      .every((filter) =>
        filter.op === 'is'
          ? (filter.values as readonly (string | null)[]).includes(event.projectId)
          : !(filter.values as readonly (string | null)[]).includes(event.projectId),
      ),
  );
  return (
    <>
      <div
        data-calendar-coverage={dataset.data.coverage}
        data-calendar-count={dataset.data.matchedCount}
        data-calendar-range={`${range.from}/${range.to}`}
        className="contents"
      >
        <CalendarView
          model={{
            data,
            tasks: dataset.data.items,
            legendTasks: legend.data.items,
            events: visibleEvents,
            scope,
            date,
            today: clock.today(),
            mode,
            weekStart: weekStart ?? data.preferences.weekStart,
            pending: commands.pending,
            onDateChange: (value) => {
              if (onDateChange) onDateChange(value);
              else setDate(value);
            },
            onModeChange: (value) => {
              if (onCalendarModeChange) onCalendarModeChange(value);
              else setMode(value);
            },
            onTaskOpen,
            ...(onTaskMenu ? { onTaskMenu } : {}),
            onNewTask,
            onProjectOpen,
            onTaskDrop: async (task, nextDate) => {
              const result = await commands.run('updateTask', {
                workspaceId,
                taskId: task.id,
                body: { expectedVersion: task.version, ...rescheduleDateOnly(task, nextDate) },
              });
              if (!result) return false;
              // Date PATCH has no Undo in source or the canonical whitelist (API §7.2).
              setToasts((current) => [
                {
                  id: crypto.randomUUID(),
                  message: t('Rescheduled “{{value1}}” to {{value2}}', {
                    value1: String(task.title),
                    value2: String(
                      calendarDateLabel(nextDate, clock.today(), data.preferences.dateFmt),
                    ),
                  }),
                  duration: 2200,
                },
                ...current,
              ]);
              return true;
            },
          }}
        />
      </div>
      {commands.error && <Alert tone="danger">{commands.error}</Alert>}
      <ToastViewport
        items={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((row) => row.id !== id))}
      />
    </>
  );
}
export interface CalendarPageProps extends Omit<CalendarPanelProps, 'query'> {
  initialView?: TaskViewState;
  controlledView?: TaskViewState;
  showHeading?: boolean;
  onCurrentViewChange?: (view: TaskViewState) => void;
}
export function CalendarPage({
  initialView,
  controlledView,
  showHeading = true,
  onCurrentViewChange,
  ...props
}: CalendarPageProps) {
  useTranslation();
  const bootstrap = useStudioQuery('getBootstrap', { workspaceId: props.workspaceId }),
    [localView, setView] = useState(initialView ?? normalizeTaskView());
  const { hostRef, onAnimationEnd } = useProjectMotion<HTMLElement>(
    `${props.workspaceId}/${props.scope.kind}/${'projectId' in props.scope ? props.scope.projectId : ''}`,
    `${JSON.stringify(controlledView ?? localView)}/${JSON.stringify(bootstrap.data)}`,
    'page',
    JSON.stringify(controlledView ?? localView),
    !showHeading ? false : undefined,
  );
  if (!bootstrap.data)
    return bootstrap.error ? (
      <Alert tone="danger">{bootstrap.error.message}</Alert>
    ) : (
      <div className="p-6" role="status">
        {t('Loading calendar…')}
      </div>
    );
  const view = controlledView ?? localView;
  const data = bootstrap.data.data,
    projects = data.projects.filter((row) => row.access === 'allowed').map((row) => row.project);
  function change(next: TaskViewState) {
    setView(next);
    if (onCurrentViewChange) {
      onCurrentViewChange(next);
      return;
    }
  }
  return (
    <main
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion={showHeading || undefined}
      className={
        !showHeading && props.scope.kind === 'project' ? 'task-page contents!' : 'task-page'
      }
      data-project-view-page={(!showHeading && props.scope.kind === 'project') || undefined}
      data-calendar-page={props.scope.kind}
    >
      {showHeading && (
        <div className="task-page-heading">
          <div>
            <h1>{t('Calendar')}</h1>
            <p>{t('Deadlines and events across every project.')}</p>
          </div>
          <div className="task-page-actions">
            <Button variant="primary" onClick={() => props.onNewTask({})}>
              <Icon name="plus" size={14} />
              {t('New task')}
            </Button>
          </div>
        </div>
      )}
      <TaskViewToolbar
        value={view}
        onChange={change}
        lookups={{ members: data.members, projects, currentMemberId: data.currentMember.id }}
        group={false}
        right={
          props.scope.kind === 'project' ? (
            <Button variant="primary" size="sm" onClick={() => props.onNewTask({})}>
              <Icon name="plus" size={13} />
              {t('New task')}
            </Button>
          ) : undefined
        }
      />
      <CalendarPanel {...props} query={view.query} />
    </main>
  );
}
export function WorkspaceCalendar() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    intents = useWorkspaceIntents(),
    navigate = useNavigate(),
    route = useLocation(),
    calendarState = useCalendarRouteState();
  return (
    <CalendarPage
      {...calendarState}
      controlledView={decodeCurrentTaskView(route.searchStr)}
      workspaceId={workspaceId}
      scope={{ kind: 'workspace' }}
      onCurrentViewChange={(view) => {
        void navigate({
          to: route.pathname,
          search: (previous) => ({ ...previous, view: JSON.stringify(view) }),
          replace: true,
        });
      }}
      onTaskOpen={intents.openTask}
      onTaskMenu={intents.openTaskMenu}
      onNewTask={(defaults) => intents.openTaskForm(undefined, defaults)}
      onProjectOpen={(id, tab) => {
        void navigate({ to: links.project(workspaceId, id, tab) });
      }}
    />
  );
}
