import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useNavigate } from '@tanstack/react-router';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Icon,
  Panel,
  PanelBody,
  PanelHeader,
  StackedBar,
} from '@studio/ui';
import type { ProjectDto, TaskDto } from '@studio/contracts/api';
import { TaskQuerySchema, taskStatuses } from '@studio/contracts/api';
import { dateDistance } from '@studio/domain';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useDataRuntime } from '../../data/context';
import { useStudioQuery } from '../../data/queries';
import { links } from '../../app/navigation';
import { useTaskListDataset } from '../tasks/useTaskListDataset';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
import { TaskMiniRow } from '../tasks/TaskMiniRow';
import { TaskStatusIcon } from '../tasks/atoms';
import { MemberIdentity } from '../people/MemberIdentity';
import { ActivityFeed } from '../activity/ActivityFeed';
import { useProjectFeed } from '../activity/project-feed';
import { useProjectIntents } from './project-intents';
import { ProjectMemberStack } from './ProjectComponents';
import { projectDate } from './format';
import { ProjectStatusPicker } from './ProjectHeader';
import { useProjectView } from './project-view';
export function ProjectOverview() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    { projectId, onViewChange, view } = useProjectView(),
    data = useWorkspaceBootstrap().data!.data,
    item = data.projects.find((item) => item.project.id === projectId)!,
    project = item.project as ProjectDto,
    { clock } = useDataRuntime(),
    intents = useWorkspaceIntents(),
    projects = useProjectIntents(),
    navigate = useNavigate(),
    dataset = useTaskListDataset(workspaceId, TaskQuerySchema.parse({ projectId: project.id })),
    summary = useStudioQuery('getProjectSummary', { workspaceId, projectId }),
    feed = useProjectFeed(workspaceId, projectId, false),
    commands = useTaskListCommands(workspaceId);
  if (dataset.error || summary.error || feed.error)
    return <Alert tone="danger">{(dataset.error ?? summary.error ?? feed.error)!.message}</Alert>;
  if (!dataset.data || !summary.data || !feed.data)
    return (
      <div className="p-6" role="status">
        {t('Loading project…')}
      </div>
    );
  const tasks = dataset.data,
    totals = summary.data.data.taskSummary,
    soon = tasks
      .filter((task) => task.status !== 'done' && task.dueDate)
      .sort(
        (a, b) =>
          a.dueDate!.localeCompare(b.dueDate!) ||
          a.position - b.position ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 6),
    days = project.dueDate ? dateDistance(project.dueDate, clock.today()) : null;
  const openList = () => {
    void navigate({
      to: links.project(workspaceId, projectId, 'list'),
      search: { view: JSON.stringify(view) },
    });
  };
  const complete = async (task: TaskDto) => {
    const result = await commands.run('setTaskCompletion', {
      workspaceId,
      taskId: task.id,
      body: { expectedVersion: task.version, completed: task.status !== 'done' },
    });
    if (result?.data.undo)
      projects.notice(t('Completed {{name}}', { name: task.title }), result.data.undo);
  };
  const commonFeed = {
    onActorOpen: (id: string) => {
      void navigate({ to: `/w/${workspaceId}/members/${id}` });
    },
    data,
    tasks: feed.data.tasks,
    now: clock.now(),
    today: clock.today(),
    onTaskOpen: intents.openTask,
    onProjectOpen: (id: string) => {
      void navigate({ to: links.project(workspaceId, id) });
    },
  };
  return (
    <div
      className="mx-auto max-w-[1160px] px-[var(--gutter)] pb-[72px] pt-[22px]"
      data-project-overview
    >
      <div className="project-overview-grid">
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader
              heading={t('About')}
              actions={
                <Button variant="ghost" size="sm" onClick={() => projects.editProject(projectId)}>
                  <Icon name="pencil" size={13} />
                  {t('Edit')}
                </Button>
              }
            />
            <PanelBody className="text-[14px] leading-[1.6]">{project.description}</PanelBody>
          </Panel>
          <Panel>
            <PanelHeader
              heading={t('Progress')}
              actions={
                <span className="text-xs text-muted">
                  {totals.completed}
                  {'  '}
                  {t('of')} {totals.total}
                  {'  '}
                  {t('tasks done')}
                </span>
              }
            />
            <PanelBody>
              <div className="mb-[10px] flex items-baseline gap-[10px]">
                <span className="text-[30px] font-semibold tracking-[-.03em] tabular-nums">
                  {summary.data.data.progress}
                  {'%'}
                </span>
                <span className="text-secondary">
                  {days === null
                    ? t('No target date')
                    : days >= 0
                      ? t('{{value1}} days until {{value2}}', {
                          value1: String(days),
                          value2: String(projectDate(project.dueDate, false, clock.today())),
                        })
                      : t('Ended {{value1}}', {
                          value1: String(projectDate(project.dueDate, false, clock.today())),
                        })}
                </span>
                {totals.overdue > 0 && (
                  <Badge tone="red">
                    <Icon name="clock-alert" size={11} />
                    {totals.overdue}
                    {'  '}
                    {t('overdue')}
                  </Badge>
                )}
              </div>
              <StackedBar
                data-project-stackedbar
                className="mb-3 h-2!"
                label={t('Project task statuses')}
                segments={taskStatuses.map((status) => ({
                  value: (totals.byStatus[status.id] / Math.max(1, totals.total)) * 100,
                  color: `var(--st-${status.id})`,
                }))}
              />
              <div className="flex flex-wrap items-center gap-[14px] text-sm">
                {taskStatuses.map((status) => (
                  <button
                    key={status.id}
                    className="flex items-center gap-[5px]"
                    onClick={() => {
                      const next = {
                        ...view,
                        query: {
                          ...view.query,
                          filters: [
                            { field: 'status' as const, op: 'is' as const, values: [status.id] },
                          ],
                        },
                      };
                      onViewChange(next);
                      void navigate({
                        to: links.project(workspaceId, projectId, 'list'),
                        search: { view: JSON.stringify(next) },
                      });
                    }}
                  >
                    <TaskStatusIcon status={status.id} size={12} />
                    <span className="text-secondary">{t(status.name)}</span>
                    <b className="font-semibold tabular-nums">{totals.byStatus[status.id]}</b>
                  </button>
                ))}
              </div>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader
              heading={t('Coming up')}
              actions={
                <Button variant="ghost" size="sm" onClick={openList}>
                  {t('View list')}
                </Button>
              }
            />
            {soon.length ? (
              soon.map((task) => (
                <TaskMiniRow
                  key={task.id}
                  task={task}
                  project={project}
                  today={clock.today()}
                  member={data.members.find((member) => member.id === task.assigneeId) ?? null}
                  showProject={false}
                  onOpen={intents.openTask}
                  onComplete={(task) => {
                    void complete(task);
                  }}
                />
              ))
            ) : (
              <EmptyState
                icon="circle-check"
                heading={t('Nothing scheduled')}
                description={t('Tasks with due dates will show up here.')}
                size="sm"
              />
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader heading={t('Details')} />
            <PanelBody>
              <dl className="mt-[1em] mb-[1em] ml-0 mr-0 grid grid-cols-[112px_minmax(0,1fr)] max-[640px]:grid-cols-[96px_minmax(0,1fr)] items-center gap-y-[2px] text-sm text-muted">
                {[
                  ['circle-dot', 'Status'],
                  ['user', 'Lead'],
                  ['users', 'Team'],
                  ['calendar', 'Start'],
                  ['flag', 'Due'],
                  ['user-plus', 'Members'],
                ].map(([icon, label]) => (
                  <div key={String(label)} className="contents">
                    <dt className="m-0 flex h-[30px] items-center gap-[7px] text-secondary">
                      <Icon
                        name={icon as Parameters<typeof Icon>[0]['name']}
                        size={14}
                        className="text-faint"
                      />
                      {t(String(label))}
                    </dt>
                    <dd className="m-0 flex min-h-[30px] min-w-0 flex-wrap items-center gap-1">
                      {label === 'Status' ? (
                        <ProjectStatusPicker project={project} overview />
                      ) : label === 'Lead' ? (
                        <button
                          onClick={() => {
                            void navigate({ to: `/w/${workspaceId}/members/${project.leadId}` });
                          }}
                          className="inline-flex h-[26px] items-center gap-[6px] rounded-sm px-[7px] text-foreground"
                        >
                          <MemberIdentity
                            className="static!"
                            member={
                              data.members.find((member) => member.id === project.leadId) ?? null
                            }
                          />
                        </button>
                      ) : label === 'Team' ? (
                        <button
                          className="inline-flex h-[26px] items-center gap-[6px] rounded-sm px-[7px] text-foreground source-hover:bg-surface-2"
                          onClick={() => {
                            if (project.teamId)
                              void navigate({ to: `/w/${workspaceId}/teams/${project.teamId}` });
                          }}
                        >
                          {project.teamId && (
                            <Icon
                              name={
                                data.teams.find((team) => team.id === project.teamId)!
                                  .icon as Parameters<typeof Icon>[0]['name']
                              }
                              size={13}
                            />
                          )}
                          {data.teams.find((team) => team.id === project.teamId)?.name ?? 'No team'}
                        </button>
                      ) : label === 'Members' ? (
                        <button
                          className="inline-flex h-[26px] items-center gap-[6px] rounded-sm px-[7px] source-hover:bg-surface-2"
                          onClick={() => projects.shareProject(projectId)}
                        >
                          <ProjectMemberStack memberIds={project.memberIds} max={6} data={data} />
                          <span className="text-muted">{project.memberIds.length}</span>
                        </button>
                      ) : (
                        <span className="inline-flex h-[26px] items-center rounded-sm px-[7px] tabular-nums text-foreground">
                          {projectDate(
                            label === 'Start' ? project.startDate : project.dueDate,
                            true,
                            clock.today(),
                          )}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader heading={t('Milestones')} />
            <PanelBody>
              {project.milestones.length ? (
                project.milestones.map((milestone) => (
                  <div key={milestone.id} className="flex h-8 items-center gap-2 text-[13px]">
                    <span
                      className="mx-[3px] size-[9px] shrink-0 rotate-45 rounded-[2px]"
                      style={{
                        background: milestone.date < clock.today() ? 'var(--green)' : project.color,
                      }}
                    />
                    <span
                      className={`grow truncate ${milestone.date < clock.today() ? 'text-muted' : ''}`}
                    >
                      {milestone.name}
                    </span>
                    <span className="tabular-nums text-secondary">
                      {projectDate(milestone.date, false, clock.today())}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-muted">{t('No milestones yet')}</span>
              )}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader
              heading={t('Recent activity')}
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigate({
                      to: links.project(workspaceId, projectId, 'activity'),
                      search: { view: JSON.stringify(view) },
                    });
                  }}
                >
                  {t('View all')}
                </Button>
              }
            />
            <PanelBody>
              {feed.data.activities.length ? (
                <ActivityFeed records={feed.data.activities.slice(0, 6)} {...commonFeed} />
              ) : (
                <span className="text-muted">{t('No activity yet')}</span>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>
      {commands.error && <Alert tone="danger">{commands.error}</Alert>}
    </div>
  );
}
export function ProjectActivity() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    { projectId } = useProjectView(),
    data = useWorkspaceBootstrap().data!.data,
    { clock } = useDataRuntime(),
    intents = useWorkspaceIntents(),
    navigate = useNavigate(),
    feed = useProjectFeed(workspaceId, projectId, true);
  return (
    <div
      className="mx-auto max-w-[780px] px-[var(--gutter)] pb-[72px] pt-[18px]"
      data-project-activity
      data-activity-coverage={feed.data?.coverage ?? 'pending'}
    >
      {feed.error ? (
        <Alert tone="danger">{feed.error.message}</Alert>
      ) : !feed.data ? (
        <div role="status">{t('Loading activity…')}</div>
      ) : feed.data.records.length ? (
        <ActivityFeed
          records={feed.data.records}
          data={data}
          tasks={feed.data.tasks}
          now={clock.now()}
          today={clock.today()}
          grouped
          lined
          onActorOpen={(id) => {
            void navigate({ to: `/w/${workspaceId}/members/${id}` });
          }}
          onTaskOpen={intents.openTask}
          onProjectOpen={(id) => {
            void navigate({ to: links.project(workspaceId, id) });
          }}
        />
      ) : (
        <EmptyState
          icon="activity"
          heading={t('No activity yet')}
          description={t('Changes to this project will appear here.')}
        />
      )}
    </div>
  );
}
