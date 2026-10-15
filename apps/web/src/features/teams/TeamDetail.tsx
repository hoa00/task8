import { translateErrorMessage } from '../../i18n/error-message';
import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import './teams.css';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Alert, Badge, Button, Icon, Panel, PanelBody, PanelHeader } from '@studio/ui';
import { TaskQuerySchema } from '@studio/contracts/api';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { FullNotFoundBoundary } from '../../app/shell/Boundaries';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useStudioQuery } from '../../data/queries';
import { StudioApiError } from '../../data/errors';
import { useDataRuntime } from '../../data/context';
import { useCompleteMembers } from '../people/catalogue';
import { usePeopleIntents } from '../people/people-intents';
import { MemberIdentity } from '../people/MemberIdentity';
import { CompactProjectRow } from '../projects/ProjectComponents';
import { useSurfaceMotion } from '../../app/services/surface-motion';
import { TaskMiniRow } from '../tasks/TaskMiniRow';
import { useTaskListDataset } from '../tasks/useTaskListDataset';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
import { links } from '../../app/navigation';
import { TeamIdentity } from './TeamIdentity';
import { useTeamIntents } from './team-intents';
export interface TeamDetailProps {
  teamId: string;
}
export function TeamDetail({ teamId }: TeamDetailProps) {
  useTranslation();
  const data = useWorkspaceBootstrap().data!.data,
    workspaceId = useWorkspaceId(),
    team = useStudioQuery('getTeam', { workspaceId, teamId }),
    summary = useStudioQuery('getTeamSummary', { workspaceId, teamId }),
    catalog = useCompleteMembers(workspaceId),
    tasks = useTaskListDataset(workspaceId, TaskQuerySchema.parse({})),
    intents = useTeamIntents(),
    people = usePeopleIntents(),
    taskIntents = useWorkspaceIntents(),
    projectsServices = useAppServices(),
    commands = useTaskListCommands(workspaceId),
    navigate = useNavigate(),
    { clock } = useDataRuntime(),
    location = useLocation(),
    { hostRef, onAnimationEnd } = useSurfaceMotion(
      location.pathname,
      `${team.dataUpdatedAt}/${summary.dataUpdatedAt}/${catalog.dataUpdatedAt}/${tasks.dataUpdatedAt}`,
      'page',
      projectsServices.surfaceRevision,
    );
  const error = team.error ?? summary.error ?? catalog.error ?? tasks.error;
  if (
    !data.teams.some((item) => item.id === teamId) ||
    (error instanceof StudioApiError && error.status === 404)
  )
    return (
      <FullNotFoundBoundary className="team-not-found-motion" home={`/w/${workspaceId}/home`} />
    );
  if (error)
    return (
      <div className="p-6">
        <Alert tone="danger">
          {translateErrorMessage(error.message)}
          <Button
            size="sm"
            onClick={() => {
              void team.refetch();
              void summary.refetch();
              void catalog.refetch();
              void tasks.refetch();
            }}
          >
            {t('Retry')}
          </Button>
        </Alert>
      </div>
    );
  if (!team.data || !summary.data || !catalog.data || !tasks.data)
    return (
      <div className="p-6" role="status">
        {t('Loading team…')}
      </div>
    );
  const current = team.data.data,
    members = catalog.data.items
      .filter((member) => member.teamId === current.id)
      .sort(
        (a, b) =>
          data.members.findIndex((member) => member.id === a.id) -
          data.members.findIndex((member) => member.id === b.id),
      ),
    open = tasks.data
      .filter(
        (task) =>
          task.assigneeId && current.memberIds.includes(task.assigneeId) && task.status !== 'done',
      )
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    assignedProjects = summary.data.data.projects;
  return (
    <div
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion
      className="mx-auto max-w-[1160px] px-[var(--gutter)] pb-[72px] pt-7 source-tablet:pb-24 source-tablet:pt-5"
      data-team-detail={current.id}
      data-teams-ready
    >
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="flex items-center gap-3">
          <TeamIdentity team={current} iconOnly large />
          <div>
            <h1 className="m-0 text-balance text-2xl font-semibold leading-[1.2] tracking-[-.022em] source-mobile:text-xl">
              {current.name}
            </h1>
            <p className="mb-0 mt-[2px] text-body text-secondary">{current.description}</p>
          </div>
        </div>
        <div className="ml-auto flex gap-[6px] source-mobile:ml-0 source-mobile:w-full">
          <Button variant="secondary" onClick={() => intents.editTeam(current.id)}>
            <Icon name="pencil" size={14} />
            {t('Edit team')}
          </Button>
          <Button variant="secondary" onClick={people.invite}>
            <Icon name="user-plus" size={14} />
            {t('Invite to workspace')}
          </Button>
        </div>
      </div>
      <div
        data-team-detail-grid
        className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 source-wide:grid-cols-[minmax(0,1fr)]"
      >
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader heading={t('Projects')}>
              <span className="text-muted">{assignedProjects.length}</span>
            </PanelHeader>
            {assignedProjects.length ? (
              assignedProjects.map((item) => (
                <CompactProjectRow
                  key={item.project.id}
                  item={item}
                  teamDetail
                  onOpen={(id) => {
                    void navigate({ to: links.project(workspaceId, id) });
                  }}
                />
              ))
            ) : (
              <PanelBody className="text-muted">{t('No projects')}</PanelBody>
            )}
          </Panel>
          <Panel>
            <PanelHeader heading={t('Open tasks')}>
              <span className="text-muted">{summary.data.data.open}</span>
            </PanelHeader>
            {open.slice(0, 8).map((task) => {
              const item = data.projects.find((item) => item.project.id === task.projectId);
              return item?.access === 'allowed' ? (
                <TaskMiniRow
                  key={task.id}
                  task={task}
                  project={item.project}
                  member={data.members.find((member) => member.id === task.assigneeId) ?? null}
                  today={clock.today()}
                  onOpen={taskIntents.openTask}
                  onComplete={async (task) => {
                    const result = await commands.run('setTaskCompletion', {
                      workspaceId,
                      taskId: task.id,
                      body: { expectedVersion: task.version, completed: task.status !== 'done' },
                    });
                    if (result?.data.undo)
                      projectsServices.notice(
                        t('Completed {{name}}', { name: task.title }),
                        result.data.undo,
                      );
                  }}
                />
              ) : null;
            })}
          </Panel>
        </div>
        <Panel className="self-start">
          <PanelHeader heading={t('Members')}>
            <span className="text-muted">{members.length}</span>
          </PanelHeader>
          {members.map((member) => (
            <button
              key={member.id}
              data-team-member={member.id}
              className="flex min-h-12 w-full cursor-pointer items-center gap-[10px] border-0 border-t border-solid border-divider px-[14px] text-left source-hover:bg-surface-2"
              onClick={() => people.openProfile(member.id)}
            >
              <MemberIdentity member={member} avatarOnly size="md" className="static!" />
              <div className="flex-1">
                <div className="font-medium">{member.name}</div>
                <div className="text-xs text-muted">{member.title}</div>
              </div>
              <Badge>{member.role}</Badge>
            </button>
          ))}
        </Panel>
      </div>
      {commands.error && <Alert tone="danger">{commands.error}</Alert>}
    </div>
  );
}
