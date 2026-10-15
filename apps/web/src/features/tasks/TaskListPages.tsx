import { useCalendarRouteState } from '../../app/useCalendarRouteState';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useRef, useState } from 'react';
import { Alert, Button, Icon, SegmentedControl } from '@studio/ui';
import { addDateDays, evaluateTaskView } from '@studio/domain';
import { normalizeTaskView } from './task-view.ts';
import type { TaskViewState } from './task-view.ts';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useDataRuntime } from '../../data/context';
import { useStudioQuery } from '../../data/queries';
import { useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useTaskListDataset } from './useTaskListDataset';
import { TaskList } from './TaskList';
import { useSurfaceMotion } from '../../app/services/surface-motion';
import { TaskBoard } from './TaskBoard';
import { TaskTable } from './TaskTable';
import { CalendarPanel } from '../calendar/CalendarPages';
import type { TaskFormDefaults } from './field-types';
import type { CalendarPanelProps } from '../calendar/CalendarPages';
import { persistTaskColumns, restoreTaskColumns, taskTablePreferenceKey } from './table-view';
import { useTaskBoardDataset } from './useTaskBoardDataset';
import type { TaskBoardComposerHandle } from './TaskBoard';
import type { TaskBoardUiState } from './board-types';
import type { TaskListComposerHandle } from './TaskList';
import { TaskViewToolbar } from './TaskViewToolbar';
import { decodeCurrentTaskView } from './current-view';
import type { ListGroup, TaskListScope, TaskListUiState, TaskListModel } from './list-types';
function useTaskRouteView(workspaceId: string, kind: 'workspace' | 'mine') {
  const route = useLocation(),
    view = decodeCurrentTaskView(route.searchStr);
  if (new URLSearchParams(route.searchStr).has('view')) return view;
  try {
    return restoreTaskColumns(
      view,
      taskTablePreferenceKey(workspaceId, { kind }),
      false,
      localStorage,
    );
  } catch {
    return view;
  }
}
function useCurrentViewChange() {
  const location = useLocation(),
    navigate = useNavigate();
  return (view: TaskViewState) => {
    void navigate({
      to: location.pathname,
      search: (previous) => ({ ...previous, view: JSON.stringify(view) }),
      replace: true,
    });
  };
}
function useCurrentMode(mine = false) {
  const location = useLocation(),
    navigate = useNavigate(),
    requested = new URLSearchParams(location.searchStr).get('mode');
  const controlledMode = mine
    ? requested === 'calendar'
      ? ('calendar' as const)
      : ('list' as const)
    : requested === 'table'
      ? ('table' as const)
      : requested === 'board'
        ? ('board' as const)
        : ('list' as const);
  return {
    controlledMode,
    onModeChange: (mode: 'list' | 'board' | 'table' | 'calendar') => {
      void navigate({
        to: location.pathname,
        search: (previous) => ({ ...previous, mode }),
        replace: true,
      });
    },
  };
}
export function WorkspaceTasks() {
  useTranslation();
  const currentMode = useCurrentMode();
  const workspaceId = useWorkspaceId(),
    intents = useWorkspaceIntents(),
    onCurrentViewChange = useCurrentViewChange(),
    controlledView = useTaskRouteView(workspaceId, 'workspace'),
    calendarState = useCalendarRouteState();
  return (
    <TaskListPage
      workspaceId={workspaceId}
      scope={{ kind: 'workspace' }}
      selectedIds={intents.selectedTaskIds}
      onSelectionChange={intents.selectTasks}
      onTaskOpen={intents.openTask}
      onTitleEdit={intents.closeTask}
      onNewTask={() => intents.openTaskForm()}
      onCalendarNewTask={(defaults) => intents.openTaskForm(undefined, defaults)}
      onTaskMenu={intents.openTaskMenu}
      onTaskEdit={(id) => intents.openTaskForm(id)}
      controlledView={controlledView}
      calendarState={calendarState}
      onCurrentViewChange={onCurrentViewChange}
      {...currentMode}
    />
  );
}
export function MyTasksList() {
  useTranslation();
  const currentMode = useCurrentMode(true);
  const workspaceId = useWorkspaceId(),
    intents = useWorkspaceIntents(),
    onCurrentViewChange = useCurrentViewChange(),
    controlledView = useTaskRouteView(workspaceId, 'mine'),
    calendarState = useCalendarRouteState();
  return (
    <TaskListPage
      workspaceId={workspaceId}
      scope={{ kind: 'mine' }}
      selectedIds={[]}
      onSelectionChange={() => {}}
      onTaskOpen={intents.openTask}
      onTitleEdit={intents.closeTask}
      onNewTask={() => intents.openTaskForm()}
      onCalendarNewTask={(defaults) => intents.openTaskForm(undefined, defaults)}
      onTaskMenu={intents.openTaskMenu}
      onTaskEdit={(id) => intents.openTaskForm(id)}
      controlledView={controlledView}
      calendarState={calendarState}
      onCurrentViewChange={onCurrentViewChange}
      {...currentMode}
    />
  );
}
export interface TaskListPageProps {
  workspaceId: string;
  scope: TaskListScope;
  selectedIds: readonly string[];
  onSelectionChange: (ids: readonly string[]) => void;
  onTaskOpen: (id: string) => void;
  onTitleEdit?: () => void;
  initialView?: TaskViewState;
  controlledView?: TaskViewState;
  showHeading?: boolean;
  initialListState?: TaskListUiState | undefined;
  onCurrentViewChange?: (view: TaskViewState) => void;
  onNewTask?: () => void;
  onCalendarNewTask?: (defaults: TaskFormDefaults) => void;
  onTaskMenu?: TaskListModel['onTaskMenu'];
  onTaskEdit?: (id: string) => void;
  onModeChange?: (mode: 'list' | 'board' | 'table' | 'calendar') => void;
  controlledMode?: 'list' | 'board' | 'table' | 'calendar';
  initialMode?: 'list' | 'board' | 'table' | 'calendar';
  initialBoardState?: TaskBoardUiState;
  calendarState?: Pick<
    CalendarPanelProps,
    'controlledDate' | 'controlledCalendarMode' | 'onDateChange' | 'onCalendarModeChange'
  >;
  initialCalendarState?: Pick<CalendarPanelProps, 'initialDate' | 'initialMode' | 'weekStart'>;
}
export function TaskListPage({
  workspaceId,
  scope,
  selectedIds,
  onSelectionChange,
  onTaskOpen,
  onTitleEdit = () => {},
  initialView,
  controlledView,
  showHeading = true,
  initialListState,
  onCurrentViewChange,
  onNewTask,
  onCalendarNewTask,
  onTaskMenu,
  onTaskEdit,
  onModeChange,
  controlledMode,
  initialMode,
  initialBoardState,
  initialCalendarState,
  calendarState,
}: TaskListPageProps) {
  useTranslation();
  const { clock } = useDataRuntime(),
    bootstrap = useStudioQuery('getBootstrap', { workspaceId });
  const composer = useRef<TaskListComposerHandle>(null),
    boardComposer = useRef<TaskBoardComposerHandle>(null);
  const [localMode, setMode] = useState<'list' | 'board' | 'table' | 'calendar'>(
    initialMode ?? 'list',
  );
  const preferenceKey = taskTablePreferenceKey(workspaceId, scope);
  const [localView, setView] = useState(() =>
    restoreTaskColumns(
      initialView ?? normalizeTaskView(),
      preferenceKey,
      scope.kind === 'project' || scope.kind === 'saved',
      (() => {
        try {
          return localStorage;
        } catch {
          return null;
        }
      })(),
    ),
  );
  const view = controlledView ?? localView;
  const requestedMode = controlledMode ?? localMode;
  const mode =
    scope.kind === 'mine'
      ? requestedMode === 'calendar'
        ? 'calendar'
        : 'list'
      : requestedMode === 'calendar'
        ? 'list'
        : requestedMode;
  const mine = scope.kind === 'mine',
    project = scope.kind === 'project' || scope.kind === 'saved';
  const query = normalizeTaskView({
    query: {
      ...view.query,
      ...(project ? { projectId: scope.projectId } : {}),
      ...(mine && bootstrap.data
        ? {
            assigneeId: bootstrap.data.data.currentMember.id,
            ...(view.query.sortField === 'manual' ? { sortField: 'due' } : {}),
          }
        : {}),
    },
  }).query;
  const dataset = useTaskListDataset(workspaceId, query);
  const columnQuery = normalizeTaskView({
    query: { ...(project ? { projectId: scope.projectId } : {}) },
  }).query;
  const columnsDataset = useTaskBoardDataset(
    workspaceId,
    columnQuery,
    mode === 'board' || mode === 'table',
  );
  const { hostRef, onAnimationEnd } = useSurfaceMotion<HTMLElement>(
    `${workspaceId}/${scope.kind}/${'projectId' in scope ? scope.projectId : ''}`,
    JSON.stringify(dataset.data),
    'page',
    `${JSON.stringify(view)}/${mode}/${selectedIds.join(',')}`,
    project && !showHeading ? false : undefined,
  );
  const pageProps = {
    ref: hostRef,
    onAnimationEnd,
    'data-project-page-motion': showHeading || undefined,
    className: project && !showHeading ? 'task-page contents!' : 'task-page',
    'data-project-task-page': (project && !showHeading) || undefined,
    'data-list-scope': scope.kind,
  };
  if (bootstrap.error || dataset.error || columnsDataset.error)
    return (
      <main {...pageProps} data-query-coverage="failed">
        <Alert tone="danger">
          {(bootstrap.error ?? dataset.error ?? columnsDataset.error)!.message}
        </Alert>
      </main>
    );
  if (
    !bootstrap.data ||
    !dataset.data ||
    ((mode === 'board' || mode === 'table') && !columnsDataset.data)
  )
    return (
      <main {...pageProps} aria-busy data-query-coverage="pending">
        <div className="p-6" role="status">
          {t('Loading tasks…')}
        </div>
      </main>
    );
  const data = bootstrap.data.data,
    tasks = dataset.data,
    projects = data.projects
      .filter((item) => item.access === 'allowed')
      .map((item) => item.project),
    env = {
      today: clock.today(),
      now: Date.parse(clock.now()),
      lookups: { members: data.members, projects },
    };
  const evaluated = evaluateTaskView(tasks, { ...view, query }, env);
  const groups: readonly ListGroup[] = mine
    ? [
        {
          key: 'overdue',
          name: 'Overdue',
          taskIds: tasks
            .filter(
              (task) => task.status !== 'done' && task.dueDate && task.dueDate < clock.today(),
            )
            .map((task) => task.id),
        },
        {
          key: 'today',
          name: 'Today',
          taskIds: tasks
            .filter((task) => task.status !== 'done' && task.dueDate === clock.today())
            .map((task) => task.id),
          createPatch: { dueDate: clock.today() },
        },
        {
          key: 'upcoming',
          name: 'Upcoming',
          taskIds: tasks
            .filter(
              (task) => task.status !== 'done' && (!task.dueDate || task.dueDate > clock.today()),
            )
            .map((task) => task.id),
          createPatch: { dueDate: addDateDays(clock.today(), 3) },
        },
        {
          key: 'completed',
          name: 'Completed',
          taskIds: tasks.filter((task) => task.status === 'done').map((task) => task.id),
          createPatch: { status: 'done' },
          collapsed: true,
        },
      ]
    : evaluated.groups;
  function changeMode(next: string) {
    if (next !== 'list' && next !== 'board' && next !== 'table' && next !== 'calendar') return;
    if (mine ? next !== 'list' && next !== 'calendar' : next === 'calendar') return;
    setMode(next);
    if (onModeChange) onModeChange(next);
  }
  function change(next: TaskViewState) {
    setView(next);
    persistTaskColumns(next, preferenceKey);
    if (onCurrentViewChange) {
      onCurrentViewChange(next);
      return;
    }
  }
  const title = mine
    ? 'My Tasks'
    : project
      ? scope.kind === 'saved'
        ? 'Saved List'
        : 'Project List'
      : 'Tasks';
  return (
    <main
      {...pageProps}
      aria-busy={dataset.isFetching}
      data-query-coverage={dataset.isPlaceholderData ? 'pending' : 'complete'}
    >
      {showHeading && (
        <div className="task-page-heading">
          <div>
            <h1>{project ? title : t(title)}</h1>
            <p>
              {mine
                ? t('{{today}} due today · {{overdue}} overdue · {{upcoming}} upcoming', {
                    today: groups[1]!.taskIds.length,
                    overdue: groups[0]!.taskIds.length,
                    upcoming: groups[2]!.taskIds.length,
                  })
                : project
                  ? t('Project task views')
                  : t('Every task across {{count}} projects.', { count: projects.length })}
            </p>
          </div>
          <div className="task-page-actions">
            {mine && (
              <SegmentedControl
                label={t('View')}
                value={mode}
                items={[
                  { value: 'list', label: t('List'), icon: <Icon name="list" size={13} /> },
                  {
                    value: 'calendar',
                    label: t('Calendar'),
                    icon: <Icon name="calendar" size={13} />,
                  },
                ]}
                onValueChange={changeMode}
              />
            )}
            <Button
              variant="primary"
              disabled={!projects.length}
              onClick={() =>
                onNewTask
                  ? onNewTask()
                  : mode === 'board'
                    ? boardComposer.current?.begin()
                    : composer.current?.begin()
              }
            >
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
        group={!mine && mode !== 'board' && mode !== 'calendar'}
        columns={mode === 'table'}
        right={
          !mine && !project ? (
            <SegmentedControl
              label={t('Task view')}
              value={mode}
              items={[
                {
                  value: 'list',
                  label: <span className="task-hide-mobile">{t('List')}</span>,
                  icon: <Icon name="list" size={13} />,
                },
                {
                  value: 'board',
                  label: <span className="task-hide-mobile">{t('Board')}</span>,
                  icon: <Icon name="square-kanban" size={13} />,
                },
                {
                  value: 'table',
                  label: <span className="task-hide-mobile">{t('Table')}</span>,
                  icon: <Icon name="table-2" size={13} />,
                },
              ]}
              onValueChange={changeMode}
            />
          ) : project && onNewTask ? (
            <Button variant="primary" size="sm" onClick={onNewTask}>
              <Icon name="plus" size={13} />
              {t('New task')}
            </Button>
          ) : undefined
        }
      />
      {mode === 'calendar' ? (
        <CalendarPanel
          {...initialCalendarState}
          {...calendarState}
          workspaceId={workspaceId}
          scope={{ kind: 'mine' }}
          query={query}
          onTaskOpen={onTaskOpen}
          {...(onTaskMenu ? { onTaskMenu } : {})}
          onNewTask={(defaults) =>
            onCalendarNewTask ? onCalendarNewTask(defaults) : onNewTask?.()
          }
          onProjectOpen={() => {}}
        />
      ) : mode === 'table' && scope.kind !== 'mine' ? (
        <TaskTable
          model={{
            scope,
            data,
            tasks: evaluated.taskIds.map((id) => evaluated.rows.get(id)!.task),
            dependencyTasks: columnsDataset.data!.items,
            groups,
            view,
            onViewChange: change,
            onTaskOpen,
            onTitleEdit,
            onNewTask: onNewTask ?? (() => composer.current?.begin()),
            onTaskMenu: onTaskMenu ?? ((id) => onTaskOpen(id)),
          }}
        />
      ) : mode === 'board' && scope.kind !== 'mine' ? (
        <TaskBoard
          ref={boardComposer}
          initialState={initialBoardState}
          model={{
            scope,
            data,
            tasks,
            columnTasks: columnsDataset.data!.items,
            query,
            onTaskOpen,
            onTaskEdit: onTaskEdit ?? onTaskOpen,
            onTaskMenu: onTaskMenu ?? ((id) => onTaskOpen(id)),
          }}
        />
      ) : (
        <div className="task-list-wrap">
          <TaskList
            ref={composer}
            initialState={initialListState}
            model={{
              scope,
              data,
              tasks,
              groups,
              view,
              onViewChange: change,
              selection: {
                kind: mine ? 'completion' : 'bulk',
                selectedIds,
                onChange: onSelectionChange,
              },
              onTaskOpen,
              onTitleEdit,
              ...(onTaskMenu ? { onTaskMenu } : {}),
            }}
            columns={
              mine
                ? ['project', 'status', 'priority', 'due']
                : ['status', 'assignee', 'priority', 'due', project ? 'labels' : 'project']
            }
          />
        </div>
      )}
    </main>
  );
}
