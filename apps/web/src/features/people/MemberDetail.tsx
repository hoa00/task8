import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { TaskQuerySchema } from '@studio/contracts/api';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Panel,
  PanelBody,
  PanelHeader,
  Tabs,
} from '@studio/ui';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useDataRuntime } from '../../data/context';
import { studioQueryOptions } from '../../data/queries';
import { useTaskListDataset } from '../tasks/useTaskListDataset';
import { TaskMiniRow } from '../tasks/TaskMiniRow';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
import { CompactProjectRow } from '../projects/ProjectComponents';
import { useSurfaceMotion } from '../../app/services/surface-motion';
import { ActivityFeed } from '../activity/ActivityFeed';
import { MemberIdentity } from './MemberIdentity';
import { MemberStatus } from './MemberStatus';
import { usePeopleDirectory } from './people-query';
import { usePeopleIntents } from './people-intents';
import { ago } from '../tasks/date-display';
import { links } from '../../app/navigation';
import './people.css';
export interface MemberDetailProps {
  memberId: string;
}
export function MemberDetail({ memberId }: MemberDetailProps) {
  useTranslation();
  const data = useWorkspaceBootstrap().data!.data,
    workspaceId = useWorkspaceId(),
    directory = usePeopleDirectory(data),
    member = directory.members.find((member) => member.id === memberId),
    { client, clock } = useDataRuntime(),
    tasks = useTaskListDataset(workspaceId, TaskQuerySchema.parse({})),
    intents = usePeopleIntents(),
    taskIntents = useWorkspaceIntents(),
    projectsServices = useAppServices(),
    navigate = useNavigate(),
    commands = useTaskListCommands(workspaceId),
    [tab, setTab] = useState('assigned');
  const profile = useQuery({
      ...studioQueryOptions(client, 'getMember', { workspaceId, memberId }),
      enabled: directory.ready && !!member && !member.demo,
    }),
    summary = useQuery({
      ...studioQueryOptions(client, 'getMemberSummary', { workspaceId, memberId }),
      enabled: directory.ready && !!member && !member.demo,
    }),
    activity = useQuery({
      ...studioQueryOptions(client, 'listActivity', {
        workspaceId,
        query: { actorId: memberId, limit: 8 },
      }),
      enabled: directory.ready && !!member && !member.demo,
    });
  const location = useLocation(),
    { hostRef, onAnimationEnd } = useSurfaceMotion(
      location.pathname,
      `${directory.ready}/${tasks.dataUpdatedAt}/${summary.dataUpdatedAt}/${activity.dataUpdatedAt}/${directory.demo.dataUpdatedAt}/${tab}`,
      'page',
      projectsServices.surfaceRevision,
    );
  const error = directory.error ?? tasks.error ?? profile.error ?? summary.error ?? activity.error;
  if (error)
    return (
      <div className="p-6">
        <Alert tone="danger">
          {error.message}
          <Button
            size="sm"
            onClick={() => {
              void directory.catalog.refetch();
              void directory.session.refetch();
              if (directory.context) void directory.demo.refetch();
              void tasks.refetch();
              void profile.refetch();
              void summary.refetch();
              void activity.refetch();
            }}
          >
            {t('Retry')}
          </Button>
        </Alert>
      </div>
    );
  if (
    !directory.ready ||
    !tasks.data ||
    (member && !member.demo && (!profile.data || !summary.data || !activity.data))
  )
    return (
      <div role="status" className="p-6">
        {t('Loading member…')}
      </div>
    );
  if (!member)
    return (
      <EmptyState
        icon="user"
        heading={t('Member not found')}
        description={t('This membership is unavailable in this workspace.')}
      />
    );
  const assigned = tasks.data.filter((task) => task.assigneeId === member.id),
    open = assigned
      .filter((task) => task.status !== 'done')
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    done = assigned.filter((task) => task.status === 'done'),
    activeProjects = summary.data?.data.projects ?? [],
    stats = summary.data?.data ?? { open: 0, done: 0, overdue: 0 },
    current = tab === 'assigned' ? open : done,
    team = data.teams.find((team) => team.id === member.teamId),
    online =
      !!member.lastSeenAt && Date.parse(clock.now()) - Date.parse(member.lastSeenAt) < 5 * 60000;
  return (
    <div
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion
      className="mx-auto max-w-[1160px] px-[var(--gutter)] pb-[72px] pt-7 source-tablet:pb-24 source-tablet:pt-5"
      data-member-profile
      data-people-ready
    >
      <div className="mb-[22px] flex flex-wrap items-start gap-[18px]">
        <MemberIdentity member={member} avatarOnly size="xl" presence={online} />
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-[10px]">
            <h1 className="m-0 text-2xl font-semibold tracking-[-.02em]">{member.name}</h1>
            <Badge>
              {member.role === 'Owner' && <Icon name="crown" size={11} />} {member.role}
            </Badge>
            <MemberStatus status={member.status} profile />
          </div>
          <div className="mt-[3px] text-secondary">
            {member.title}
            {' · '}
            {team?.name ?? t('No team')}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-[14px] text-[12.5px] text-muted">
            <span className="flex items-center gap-[5px]">
              <Icon name="mail" size={13} />
              <span className="select-all">{member.email}</span>
            </span>
            <span className="flex items-center gap-[5px]">
              <Icon name="map-pin" size={13} />
              {member.timezone}
            </span>
            <span className="flex items-center gap-[5px]">
              <Icon name="clock" size={13} />
              {!member.lastSeenAt
                ? t('Never signed in')
                : online
                  ? t('Online now')
                  : t('Active {{value1}}', { value1: String(ago(member.lastSeenAt, clock.now())) })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(member.email);
                projectsServices.notice('Copied to clipboard', undefined, { duration: 4200 });
              } catch {
                projectsServices.notice("Copy isn't available here — " + member.email, undefined, {
                  kind: 'info',
                  duration: 6000,
                });
              }
            }}
          >
            <Icon name="copy" size={14} />
            {t('Copy email')}
          </Button>
          <Button variant="primary" onClick={() => intents.assign(member.id)}>
            <Icon name="plus" size={14} />
            {t('Assign task')}
          </Button>
          <IconButton
            aria-label={t('More')}
            onClick={(event) => intents.memberMenu(member.id, event.currentTarget)}
          >
            <Icon name="ellipsis" size={16} />
          </IconButton>
        </div>
      </div>
      <div className="mb-[18px] grid grid-cols-4 overflow-hidden rounded-lg border border-solid border-border source-tablet:grid-cols-2">
        {[
          ['Active projects', activeProjects.length],
          ['Assigned tasks', stats.open],
          ['Completed tasks', stats.done],
          ['Overdue', stats.overdue],
        ].map(([label, value], index) => (
          <div
            key={String(label)}
            className={`flex flex-col gap-[6px] px-4 py-[14px] text-left source-hover:bg-surface-2 ${index > 0 ? 'border-0 border-l border-solid border-border' : ''} ${index === 2 ? 'source-tablet:border-l-0' : ''} ${index > 1 ? 'source-tablet:border-t' : ''}`}
          >
            <span className="flex items-center gap-[6px] text-sm text-secondary">
              {t(String(label))}
            </span>
            <span
              className={`text-[22px] font-semibold leading-[1.1] tracking-[-.02em] tabular-nums ${label === 'Overdue' && Number(value) ? 'text-red' : ''}`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
      <div
        data-member-profile-grid
        className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 source-wide:grid-cols-[minmax(0,1fr)]"
      >
        <Panel>
          <Tabs
            className="px-2"
            label={t('Member tasks')}
            value={tab}
            items={[
              {
                value: 'assigned',
                label: t('Assigned · {{value1}}', { value1: String(stats.open) }),
              },
              {
                value: 'completed',
                label: t('Completed · {{value1}}', { value1: String(stats.done) }),
              },
            ]}
            onValueChange={(value) => {
              projectsServices.surfaceOpened();
              setTab(value);
            }}
          />
          {current.length ? (
            current.map((task) => {
              const item = data.projects.find((item) => item.project.id === task.projectId);
              return item?.access === 'allowed' ? (
                <TaskMiniRow
                  key={task.id}
                  task={task}
                  project={item.project}
                  member={null}
                  showAvatar={false}
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
            })
          ) : (
            <EmptyState
              icon="list-checks"
              heading={t('No tasks here')}
              description={t('Nothing to show in this list.')}
              size="sm"
            />
          )}
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader heading={t('Active projects')} />
            {activeProjects.length ? (
              activeProjects.map((item) => (
                <CompactProjectRow
                  key={item.project.id}
                  item={item}
                  onOpen={(id) => {
                    void navigate({ to: links.project(workspaceId, id) });
                  }}
                  membershipLabel={
                    item.access === 'allowed' && item.project.leadId === member.id
                      ? 'Lead'
                      : 'Member'
                  }
                />
              ))
            ) : (
              <PanelBody className="text-muted">{t('No active projects')}</PanelBody>
            )}
          </Panel>
          <Panel>
            <PanelHeader heading={t('Recent activity')} />
            <PanelBody>
              {activity.data?.data.items.length ? (
                <ActivityFeed
                  records={activity.data.data.items}
                  tasks={tasks.data}
                  data={data}
                  now={clock.now()}
                  today={clock.today()}
                  onTaskOpen={taskIntents.openTask}
                  onProjectOpen={(id) => {
                    void navigate({ to: links.project(workspaceId, id) });
                  }}
                  onActorOpen={intents.openProfile}
                />
              ) : (
                <span className="text-muted">{t('No recent activity')}</span>
              )}
            </PanelBody>
          </Panel>
        </div>
      </div>
      {commands.error && <Alert tone="danger">{commands.error}</Alert>}
    </div>
  );
}
