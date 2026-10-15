import { useAppServices } from '../../app/services/app-services';
import { translate as t, locale } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import {
  Alert,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Panel,
  PanelBody,
  PanelHeader,
  SegmentedControl,
  ToastViewport,
} from '@studio/ui';
import type { ToastMessage } from '@studio/ui';
import { homeDeadlines, homeTaskTabs } from '@studio/domain';
import { normalizeTaskView } from '../tasks/task-view.ts';
import type { HomeTaskTab } from '@studio/domain';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { links } from '../../app/navigation';
import { useStudioQuery } from '../../data/queries';
import { useDataRuntime } from '../../data/context';
import { TaskMiniRow } from '../tasks/TaskMiniRow';
import { PriorityIcon } from '../tasks/atoms';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
import { useTaskListDataset } from '../tasks/useTaskListDataset';
import { ActivityFeed } from '../activity/ActivityFeed';
import { usePeopleIntents } from '../people/people-intents';
import { MemberIdentity } from '../people/MemberIdentity';
import { useProjectIntents } from '../projects/project-intents';
import { useSurfaceMotion } from '../../app/services/surface-motion';
import { ProjectProgressTable } from './ProjectProgressTable';
import { StatGroup, StatItem } from './metrics';
import './dashboards.css';
export function HomePage() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    data = useWorkspaceBootstrap().data!.data,
    { clock } = useDataRuntime(),
    result = useStudioQuery('getHome', { workspaceId }),
    overview = useStudioQuery('getOverview', { workspaceId }),
    people = usePeopleIntents(),
    intents = useWorkspaceIntents(),
    projects = useProjectIntents(),
    projectsServices = useAppServices(),
    navigate = useNavigate(),
    route = useLocation(),
    commands = useTaskListCommands(workspaceId),
    { homeTaskTab: tab, setHomeTaskTab: setTab } = intents,
    [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dataset = useTaskListDataset(workspaceId, normalizeTaskView().query),
    home = result.data?.data,
    stats = overview.data?.data.taskSummary,
    { hostRef, onAnimationEnd } = useSurfaceMotion(
      route.pathname,
      `${JSON.stringify(home)}/${JSON.stringify(stats)}/${JSON.stringify(dataset.data)}/${tab}`,
      'page',
      projectsServices.surfaceRevision,
    );
  const openTask = (id: string) => {
      projectsServices.surfaceOpened();
      intents.openTask(id);
    },
    newTask = () => {
      projectsServices.surfaceOpened();
      intents.openTaskForm();
    };
  const go = (page: Parameters<typeof links.workspace>[1]) => {
      void navigate({ to: links.workspace(workspaceId, page) });
    },
    projectOpen = (id: string) => {
      void navigate({ to: links.project(workspaceId, id, 'overview') });
    };
  const tasksGo = (kind: 'open' | 'done' | 'overdue') => {
    const values = kind === 'open' ? ['backlog', 'todo', 'progress', 'review'] : ['done'];
    void navigate({
      to: links.workspace(workspaceId, 'tasks'),
      search: {
        view: JSON.stringify(
          normalizeTaskView({
            query: {
              filters:
                kind === 'overdue'
                  ? [{ field: 'due', op: 'is', values: ['overdue'] }]
                  : [{ field: 'status', op: 'is', values }],
            },
          }),
        ),
      },
    });
  };
  if (result.error || overview.error || dataset.error)
    return (
      <Alert tone="danger">{(result.error ?? overview.error ?? dataset.error)!.message}</Alert>
    );
  if (!home || !stats || !dataset.data)
    return (
      <div className="p-6" role="status">
        {t('Loading home…')}
      </div>
    );
  // Aggregate previews may be bounded in HTTP mode. Only a confirmed complete
  // projection may own tab/deadline groups; otherwise use the complete cursor read.
  const mine =
      home.myTasks.items.length === home.myTasks.total
        ? home.myTasks.items
        : dataset.data.filter((task) => task.assigneeId === data.currentMember.id),
    activeProjects = overview.data!.data.projects.filter(
      (item) => item.access === 'allowed' && item.project.status !== 'complete',
    );
  const lists = homeTaskTabs(mine, clock.today()),
    current = lists[tab].slice(0, 7),
    deadlines = homeDeadlines(
      home.deadlines.items.length === home.deadlines.total ? home.deadlines.items : dataset.data,
      clock.today(),
    ),
    instant = new Date(clock.now()),
    hour = instant.getUTCHours(),
    greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
    date = new Intl.DateTimeFormat(locale(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${clock.today()}T00:00:00Z`));
  return (
    <div
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion
      data-home
      data-dashboard-ready
      className="mx-auto max-w-[1160px] px-[var(--gutter)] pb-[72px] pt-7 source-tablet:pb-24 source-tablet:pt-5"
    >
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="m-0 text-balance text-2xl font-semibold leading-[1.2] tracking-[-.022em] source-mobile:text-xl">
            {t(greet)}
            {', '}
            {data.currentMember.name.split(' ')[0]}
          </h1>
          <p className="mb-0 mt-1 text-body text-secondary">
            <span className="tabular-nums">{date}</span>
            {'  '}
            {t("· Here's what's happening across your workspace.")}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-[6px] source-mobile:ml-0 source-mobile:w-full">
          <Button variant="secondary" className="source-mobile:hidden!" onClick={people.invite}>
            <Icon name="user-plus" size={14} />
            {t('Invite member')}
          </Button>
          <Button
            variant="secondary"
            className="source-mobile:hidden!"
            onClick={projects.newProject}
          >
            <Icon name="folder-plus" size={14} />
            {t('New project')}
          </Button>
          <Button variant="primary" onClick={newTask}>
            <Icon name="plus" size={14} />
            {t('New task')}
          </Button>
        </div>
      </div>
      <StatGroup>
        <StatItem
          label={t('Active projects')}
          icon="folder-kanban"
          value={home.counters.activeProjects}
          detail={t('{{count}} at risk', {
            count: activeProjects.filter((item) => item.project.status === 'risk').length,
          })}
          onClick={() => go('projects')}
        />
        <StatItem
          label={t('Open tasks')}
          icon="circle-dashed"
          value={stats.total - stats.completed}
          detail={t('{{count}} assigned to you', {
            count: mine.filter((task) => task.status !== 'done').length,
          })}
          onClick={() => tasksGo('open')}
        />
        <StatItem
          label={t('Completed')}
          icon="circle-check"
          value={home.counters.completedThisWeek}
          detail={t('this week')}
          detailTone="green"
          onClick={() => tasksGo('done')}
        />
        <StatItem
          label={t('Overdue')}
          icon="clock-alert"
          value={home.counters.overdue}
          detail={home.counters.overdue ? t('need attention') : t('all on track')}
          {...(home.counters.overdue ? { tone: 'red' as const, detailTone: 'red' as const } : {})}
          onClick={() => tasksGo('overdue')}
        />
      </StatGroup>
      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 source-wide:grid-cols-[minmax(0,1fr)] dashboard-grid">
        <div className="flex flex-col gap-4">
          <Panel data-project-panel>
            <PanelHeader
              className="source-mobile:flex-wrap source-mobile:[&>h2]:whitespace-nowrap"
              heading={t('My tasks')}
              actions={
                <>
                  <SegmentedControl
                    semantics="tabs"
                    label={t('My tasks')}
                    value={tab}
                    items={(['upcoming', 'overdue', 'completed'] as const).map((key) => ({
                      value: key,
                      label: (
                        <>
                          {t(key.charAt(0).toUpperCase() + key.slice(1))}{' '}
                          <span className="text-muted">{lists[key].length}</span>
                        </>
                      ),
                    }))}
                    onValueChange={(value) => setTab(value as HomeTaskTab)}
                  />
                  <IconButton
                    size="sm"
                    aria-label={t('Open My Tasks')}
                    onClick={() => go('my-tasks')}
                  >
                    <Icon name="arrow-up-right" size={15} />
                  </IconButton>
                </>
              }
            />
            {current.length ? (
              current.map((task) => {
                const item = data.projects.find((item) => item.project.id === task.projectId);
                if (!item || item.access !== 'allowed') return null;
                return (
                  <TaskMiniRow
                    key={task.id}
                    today={clock.today()}
                    task={task}
                    project={item.project}
                    member={null}
                    showAvatar={false}
                    onOpen={openTask}
                    onComplete={async (task) => {
                      const result = await commands.run('setTaskCompletion', {
                        workspaceId,
                        taskId: task.id,
                        body: { expectedVersion: task.version, completed: task.status !== 'done' },
                      });
                      if (result?.data.undo) {
                        const undo = result.data.undo;
                        setToasts((rows) => [
                          {
                            id: crypto.randomUUID(),
                            message: t('Completed {{value1}}', { value1: String(task.title) }),
                            action: {
                              label: t('Undo'),
                              onAction: () => {
                                void commands.undo(undo);
                              },
                            },
                            duration: 5000,
                          },
                          ...rows,
                        ]);
                      }
                    }}
                  />
                );
              })
            ) : (
              <EmptyState
                icon={tab === 'overdue' ? 'circle-check' : 'list-checks'}
                heading={tab === 'overdue' ? t('Nothing overdue') : t('No tasks here')}
                description={
                  tab === 'overdue'
                    ? t('Every task assigned to you is on schedule.')
                    : t('Add a task to get things moving.')
                }
                size="sm"
              />
            )}
            {lists[tab].length > 7 && (
              <button
                className="flex min-h-[34px] w-full items-center gap-[6px] border-0 border-t border-solid border-divider px-[14px] text-sm text-muted source-hover:text-accent"
                onClick={() => go('my-tasks')}
              >
                {t('View all')} {lists[tab].length}
                {'  '}
                {t('tasks')} <Icon name="arrow-right" size={13} />
              </button>
            )}
          </Panel>
          <Panel>
            <PanelHeader
              className="source-mobile:flex-wrap source-mobile:[&>h2]:whitespace-nowrap"
              heading={t('Project progress')}
              actions={
                <Button variant="ghost" size="sm" onClick={() => go('projects')}>
                  {t('All projects')}
                </Button>
              }
            />
            <ProjectProgressTable items={activeProjects} data={data} onOpen={projectOpen} />
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader
              className="source-mobile:flex-wrap source-mobile:[&>h2]:whitespace-nowrap"
              heading={t('Upcoming deadlines')}
              actions={
                <Button variant="ghost" size="sm" onClick={() => go('calendar')}>
                  <Icon name="calendar" size={13} />
                  {t('Calendar')}
                </Button>
              }
            />
            <PanelBody className="pb-[6px]!">
              {deadlines.map((group) => (
                <div key={group.name} className="mb-[10px]" data-deadline-group={group.name}>
                  <div className="mb-1 flex items-center gap-2 text-[11.5px] font-semibold text-secondary">
                    {t(group.name)}
                    <span className="font-medium text-muted" data-deadline-total>
                      {group.tasks.length}
                    </span>
                  </div>
                  {group.tasks.length ? (
                    <>
                      {group.tasks.slice(0, 4).map((task) => (
                        <div
                          key={task.id}
                          data-deadline-task={task.id}
                          role="button"
                          tabIndex={0}
                          className="flex h-[30px] cursor-pointer items-center gap-2 text-[13px]"
                          onClick={() => openTask(task.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') openTask(task.id);
                          }}
                        >
                          <span
                            className="size-2 shrink-0 rounded-[3px]"
                            style={{
                              background: data.projects.find(
                                (item) => item.project.id === task.projectId,
                              )?.project.color,
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">{task.title}</span>
                          <PriorityIcon priority={task.priority} size={13} />
                          <MemberIdentity
                            member={
                              data.members.find((member) => member.id === task.assigneeId) ?? null
                            }
                            avatarOnly
                          />
                        </div>
                      ))}
                      {group.tasks.length > 4 && (
                        <div className="pl-4 text-[11.5px] text-muted">
                          {'+'}
                          {group.tasks.length - 4}
                          {'  '}
                          {t('more')}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="pb-[2px] pt-1 text-[12.5px] text-muted">{t('Nothing due')}</div>
                  )}
                </div>
              ))}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader
              className="source-mobile:flex-wrap source-mobile:[&>h2]:whitespace-nowrap"
              heading={t('Recent activity')}
              actions={
                <Button variant="ghost" size="sm" onClick={() => go('activity')}>
                  {t('View all')}
                </Button>
              }
            />
            <PanelBody>
              <ActivityFeed
                records={home.recentActivity.items}
                data={data}
                tasks={dataset.data}
                now={clock.now()}
                today={clock.today()}
                showProject
                lined
                onActorOpen={people.openProfile}
                onTaskOpen={openTask}
                onProjectOpen={projectOpen}
              />
            </PanelBody>
          </Panel>
        </div>
      </div>
      {commands.error && <Alert tone="danger">{commands.error}</Alert>}
      <ToastViewport
        items={toasts}
        onDismiss={(id) => setToasts((rows) => rows.filter((row) => row.id !== id))}
      />
    </div>
  );
}
