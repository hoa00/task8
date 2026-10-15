import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Alert, Button, Icon, Panel, PanelBody, PanelHeader, StackedBar } from '@studio/ui';
import { normalizeTaskView } from '../tasks/task-view.ts';
import type { OverviewDto, TaskDto } from '@studio/contracts/api';
import { taskStatuses } from '@studio/contracts/api';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { links } from '../../app/navigation';
import { useStudioQuery } from '../../data/queries';
import { useDataRuntime } from '../../data/context';
import { useTaskListDataset } from '../tasks/useTaskListDataset';
import { TaskStatusIcon } from '../tasks/atoms';
import { formatTaskDate } from '../tasks/date-display';
import { MemberIdentity } from '../people/MemberIdentity';
import { useProjectIntents } from '../projects/project-intents';
import { useSurfaceMotion } from '../../app/services/surface-motion';
import { useCompleteMembers } from '../people/catalogue';
import { ProjectProgressTable } from './ProjectProgressTable';
import { StatGroup, StatItem } from './metrics';
import './dashboards.css';
export interface TaskStatusBreakdownProps {
  summary: OverviewDto['taskSummary'];
}
export function TaskStatusBreakdown({ summary }: TaskStatusBreakdownProps) {
  useTranslation();
  return (
    <Panel>
      <PanelHeader
        className="source-mobile:flex-wrap source-mobile:[&>h2]:whitespace-nowrap"
        heading={t('Tasks by status')}
      />
      <PanelBody>
        <StackedBar
          data-project-stackedbar
          data-dashboard-status-chart
          className="mb-3 h-[10px]!"
          label={t('Task status distribution')}
          segments={taskStatuses.map((status) => ({
            value: (summary.byStatus[status.id] / Math.max(summary.total, 1)) * 100,
            color: `var(--st-${status.id})`,
          }))}
        />
        {taskStatuses.map((status) => (
          <div
            key={status.id}
            className="flex h-7 items-center gap-2 text-[13px]"
            data-status-count={status.id}
          >
            <TaskStatusIcon status={status.id} />
            <span className="min-w-0 flex-1">{t(status.name)}</span>
            <span className="tabular-nums text-secondary">{summary.byStatus[status.id]}</span>
            <span className="w-9 text-right tabular-nums text-muted">
              {Math.round((summary.byStatus[status.id] / Math.max(summary.total, 1)) * 100)}
              {'%'}
            </span>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}
export interface WorkloadSummaryProps {
  workload: OverviewDto['workload'];
  tasks: readonly TaskDto[];
  onMemberOpen: (id: string) => void;
}
export function WorkloadSummary({ workload, tasks, onMemberOpen }: WorkloadSummaryProps) {
  useTranslation();
  const maximum = Math.max(...workload.map((row) => row.openTasks), 1);
  return (
    <Panel>
      <PanelHeader
        className="source-mobile:flex-wrap source-mobile:[&>h2]:whitespace-nowrap"
        heading={t('Workload')}
        actions={<span className="text-[11.5px] text-muted">{t('Open tasks per person')}</span>}
      />
      <PanelBody>
        {workload.map((row) => (
          <div
            key={row.member.id}
            className="flex h-[30px] cursor-pointer items-center gap-2 text-[13px]"
            role="link"
            tabIndex={0}
            data-workload-member={row.member.id}
            onClick={() => onMemberOpen(row.member.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onMemberOpen(row.member.id);
            }}
          >
            <MemberIdentity member={row.member} avatarOnly />
            <span className="w-24 truncate">{row.member.name.split(' ')[0]}</span>
            <span className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-[4px] bg-surface-3">
              <span className="flex" style={{ width: `${(row.openTasks / maximum) * 100}%` }}>
                {taskStatuses
                  .filter((status) => status.id !== 'done')
                  .map((status) => {
                    const count = tasks.filter(
                      (task) => task.assigneeId === row.member.id && task.status === status.id,
                    ).length;
                    return count ? (
                      <i
                        key={status.id}
                        className="block"
                        style={{ flex: count, background: `var(--st-${status.id})` }}
                      />
                    ) : null;
                  })}
              </span>
            </span>
            <span className="w-[22px] text-right tabular-nums text-secondary">{row.openTasks}</span>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}
export function WorkspaceOverview() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    data = useWorkspaceBootstrap().data!.data,
    { clock } = useDataRuntime(),
    result = useStudioQuery('getOverview', { workspaceId }),
    dataset = useTaskListDataset(workspaceId, normalizeTaskView().query),
    members = useCompleteMembers(workspaceId),
    projects = useProjectIntents(),
    projectsServices = useAppServices(),
    route = useLocation(),
    navigate = useNavigate(),
    overview = result.data?.data,
    { hostRef, onAnimationEnd } = useSurfaceMotion(
      route.pathname,
      `${JSON.stringify(overview)}/${JSON.stringify(dataset.data)}/${JSON.stringify(members.data)}`,
      'page',
      projectsServices.surfaceRevision,
    );
  if (result.error || dataset.error || members.error)
    return <Alert tone="danger">{(result.error ?? dataset.error ?? members.error)!.message}</Alert>;
  if (!overview || !dataset.data || !members.data)
    return (
      <div className="p-6" role="status">
        {t('Loading overview…')}
      </div>
    );
  const summary = overview.taskSummary,
    projectOpen = (id: string) => {
      void navigate({ to: links.project(workspaceId, id, 'overview') });
    };
  return (
    <div
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion
      data-workspace-overview
      data-dashboard-ready
      className="mx-auto max-w-[1160px] px-[var(--gutter)] pb-[72px] pt-7 source-tablet:pb-24 source-tablet:pt-5"
    >
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="m-0 text-balance text-2xl font-semibold leading-[1.2] tracking-[-.022em] source-mobile:text-xl">
            {t('Workspace overview')}
          </h1>
          <p className="mb-0 mt-1 text-body text-secondary">
            {t('Health of every project in')} {data.workspace.name}
            {'.'}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-[6px] source-mobile:ml-0 source-mobile:w-full">
          <Button
            variant="secondary"
            onClick={() => {
              void navigate({ to: links.workspace(workspaceId, 'timeline') });
            }}
          >
            <Icon name="chart-gantt" size={14} />
            {t('Timeline')}
          </Button>
          <Button variant="primary" onClick={projects.newProject}>
            <Icon name="plus" size={14} />
            {t('New project')}
          </Button>
        </div>
      </div>
      <StatGroup>
        <StatItem
          label={t('Projects')}
          value={overview.projects.length}
          detail={t('{{count}} completed', {
            count: overview.projects.filter((item) => item.project.status === 'complete').length,
          })}
        />
        <StatItem
          label={t('Tasks')}
          value={summary.total}
          detail={t('{{count}} open', { count: summary.total - summary.completed })}
        />
        <StatItem
          label={t('Completion rate')}
          value={Math.round(summary.completionRate)}
          suffix="%"
          detail={t('across all projects')}
        />
        <StatItem
          label={t('Members')}
          value={members.data.items.length}
          detail={t('{{count}} pending invitations', {
            count: members.data.items.filter((member) => member.status === 'invited').length,
          })}
        />
      </StatGroup>
      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 source-wide:grid-cols-[minmax(0,1fr)] dashboard-grid">
        <Panel>
          <PanelHeader
            className="source-mobile:flex-wrap source-mobile:[&>h2]:whitespace-nowrap"
            heading={t('Portfolio')}
          />
          <ProjectProgressTable
            items={overview.projects}
            data={data}
            portfolio
            onOpen={projectOpen}
          />
        </Panel>
        <div className="flex flex-col gap-4">
          <TaskStatusBreakdown summary={summary} />
          <WorkloadSummary
            workload={overview.workload}
            tasks={dataset.data}
            onMemberOpen={(id) => {
              void navigate({ to: `/w/${workspaceId}/members/${id}` });
            }}
          />
          <Panel>
            <PanelHeader
              className="source-mobile:flex-wrap source-mobile:[&>h2]:whitespace-nowrap"
              heading={t('Upcoming milestones')}
            />
            <PanelBody>
              {overview.milestones.map((milestone) => {
                const project = overview.projects.find(
                  (item) => item.project.id === milestone.projectId,
                )!.project;
                return (
                  <div
                    key={milestone.id}
                    data-dashboard-milestone={milestone.id}
                    role="link"
                    tabIndex={0}
                    className="flex h-8 cursor-pointer items-center gap-2 text-[13px]"
                    onClick={() => {
                      void navigate({ to: links.project(workspaceId, project.id, 'timeline') });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter')
                        void navigate({ to: links.project(workspaceId, project.id, 'timeline') });
                    }}
                  >
                    <span
                      className="mx-[3px] size-[9px] shrink-0 rotate-45 rounded-[2px]"
                      style={{ background: project.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {milestone.name}{' '}
                      <span className="text-muted">
                        {'· '}
                        {project.name}
                      </span>
                    </span>
                    <span className="tabular-nums text-secondary">
                      {formatTaskDate(milestone.date, clock.today())}
                    </span>
                  </div>
                );
              })}
              {!overview.milestones.length && (
                <div className="text-muted">{t('No upcoming milestones')}</div>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
