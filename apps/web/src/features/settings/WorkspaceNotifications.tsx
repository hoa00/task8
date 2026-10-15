import { translateErrorMessage } from '../../i18n/error-message';
import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Icon,
  IconButton,
  Panel,
  Select,
  ToastViewport,
  Toggle,
} from '@studio/ui';
import type { ToastMessage } from '@studio/ui';
import { MemberPreferencesSchema, NotificationPreferencesSchema } from '@studio/contracts/api';
import type {
  BootstrapDto,
  MemberPreferencesDto,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesInput,
  UpdatePreferencesInput,
} from '@studio/contracts/api';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useDataRuntime } from '../../data/context';
import { useStudioQuery } from '../../data/queries';
import { MemberIdentity, PermissionMatrix, RolePicker } from '../people';
import { canAdministerMember, usePeopleDirectory } from '../people/people-query';
import { usePeopleIntents } from '../people/people-intents';
import { TeamGrid } from '../teams/TeamGrid';
import { ProjectIcon } from '../projects/ProjectComponents';
import { loadProjectCatalogue } from '../projects/loadProjectCatalogue';
import { useProjectCommands } from '../projects/useProjectCommands';
import { useProjectIntents } from '../projects/project-intents';
import { SectionHeading, SettingRow, SettingsBlock } from './SettingsComponents';
import { useSettingsCommands } from './useSettingsCommands';
import '../people/people.css';

type NotificationSection = 'notif-email' | 'notif-push' | 'notif-mentions' | 'notif-assign';
const headings: Record<string, [string, string]> = {
  teams: ['Teams', 'Teams group people and projects.'],
  projects: ['Projects', 'Defaults for new projects and archived work.'],
  permissions: ['Permissions', 'Control what each role can do.'],
  'notif-email': ['Email', 'Choose which emails you receive.'],
  'notif-push': ['Push', 'Notifications on desktop and mobile.'],
  'notif-mentions': ['Mentions', 'Decide which mentions reach you.'],
  'notif-assign': ['Task assignments', 'Updates about tasks assigned to you.'],
};
interface SurfaceProps {
  section: string;
  title: string;
  lead: string;
  ready: boolean;
  children: ReactNode;
}
function Surface({ section, title, lead, ready, children }: SurfaceProps) {
  useTranslation();
  return (
    <div
      data-settings-page={section}
      data-settings-ready={ready ? '' : undefined}
      className="max-w-[720px] px-10 pb-20 pt-8 source-tablet:px-4 source-tablet:pb-24 source-tablet:pt-5"
    >
      <SectionHeading title={t(title)} lead={t(lead)} />
      {children}
    </div>
  );
}
function ReadError({ error, retry }: { error: Error; retry: () => void }) {
  useTranslation();
  return (
    <Alert tone="danger">
      {translateErrorMessage(error.message)}
      <Button size="sm" onClick={retry}>
        {t('Retry')}
      </Button>
    </Alert>
  );
}
export interface WorkspaceNotificationsProps {
  section: string;
}
export function WorkspaceNotifications({ section }: WorkspaceNotificationsProps) {
  useTranslation();
  const data = useWorkspaceBootstrap().data!.data;
  if (section === 'members') return <SettingsMembers data={data} />;
  if (section === 'teams') return <SettingsTeams data={data} />;
  if (section === 'projects') return <SettingsProjects data={data} />;
  if (section === 'permissions') return <SettingsPermissions data={data} />;
  return <NotificationSettings section={section as NotificationSection} />;
}
function SettingsMembers({ data }: { data: BootstrapDto }) {
  useTranslation();
  const directory = usePeopleDirectory(data),
    intents = usePeopleIntents(),
    navigate = useNavigate();
  return (
    <Surface
      section="members"
      title={t('Members')}
      lead={t('{{value1}} people have access to {{value2}}.', {
        value1: String(directory.members.length),
        value2: String(data.workspace.name),
      })}
      ready={directory.ready && !directory.error}
    >
      {directory.error ? (
        <ReadError
          error={directory.error}
          retry={() => {
            void directory.catalog.refetch();
            void directory.session.refetch();
            if (directory.context) void directory.demo.refetch();
          }}
        />
      ) : !directory.ready ? (
        <div role="status">{t('Loading settings…')}</div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Button variant="primary" disabled={!directory.enabled} onClick={intents.invite}>
              <Icon name="user-plus" size={14} />
              {t('Invite member')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void navigate({ to: `/w/${data.workspace.id}/members` });
              }}
            >
              {t('Open member directory')}
            </Button>
          </div>
          <Panel className="overflow-hidden" data-settings-members>
            {directory.members.map((member) => (
              <div
                key={member.id}
                data-settings-member={member.id}
                className="flex min-h-[52px] items-center gap-[10px] border-0 border-t border-solid border-divider px-[14px] py-0 first:border-t-0 source-hover:bg-surface-2"
                onContextMenu={(event) => {
                  event.preventDefault();
                  intents.memberMenu(member.id, event.currentTarget);
                }}
              >
                <MemberIdentity member={member} avatarOnly size="md" className="static!" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{member.name}</div>
                  <div className="text-xs text-muted">{member.email}</div>
                </div>
                {member.status === 'invited' && <Badge tone="amber">{t('Invited')}</Badge>}
                <RolePicker
                  member={member}
                  readonly={!canAdministerMember(member, data.currentMember.id, directory.enabled)}
                  onChange={(role) => intents.changeRole(member.id, role)}
                />
                <IconButton
                  size="sm"
                  aria-label={t('Options')}
                  onClick={(event) => intents.memberMenu(member.id, event.currentTarget)}
                >
                  <Icon name="ellipsis" size={14} />
                </IconButton>
              </div>
            ))}
          </Panel>
        </>
      )}
    </Surface>
  );
}
function SettingsTeams({ data }: { data: BootstrapDto }) {
  useTranslation();
  const teams = useStudioQuery('listTeams', { workspaceId: data.workspace.id, query: {} }),
    navigate = useNavigate();
  return (
    <Surface
      section="teams"
      title={headings.teams![0]}
      lead={headings.teams![1]}
      ready={!!teams.data && !teams.error}
    >
      {teams.error ? (
        <ReadError
          error={teams.error}
          retry={() => {
            void teams.refetch();
          }}
        />
      ) : !teams.data ? (
        <div role="status">{t('Loading settings…')}</div>
      ) : (
        <TeamGrid
          teams={teams.data.data}
          data={data}
          onOpen={(id) => {
            void navigate({ to: `/w/${data.workspace.id}/teams/${id}` });
          }}
        />
      )}
    </Surface>
  );
}
function SettingsProjects({ data }: { data: BootstrapDto }) {
  useTranslation();
  const workspaceId = data.workspace.id,
    { client } = useDataRuntime(),
    navigate = useNavigate(),
    intents = useProjectIntents(),
    intentsServices = useAppServices(),
    commands = useProjectCommands(workspaceId),
    settings = useSettingsCommands(),
    preferences = useStudioQuery('getPreferences', { workspaceId }),
    [draft, setDraft] = useState<UpdatePreferencesInput>({});
  const projects = useQuery({
      queryKey: ['workspace', workspaceId, 'projects', 'settings-archived-complete'],
      queryFn: ({ signal }) =>
        loadProjectCatalogue(client, workspaceId, { archived: true }, signal),
    }),
    error = preferences.error ?? projects.error;
  const value = preferences.data
    ? MemberPreferencesSchema.parse({ ...preferences.data.data, ...draft })
    : null;
  async function change(patch: UpdatePreferencesInput) {
    if (settings.isPending()) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    if (await settings.run('updatePreferences', { workspaceId, body: next })) setDraft({});
  }
  return (
    <Surface
      section="projects"
      title={headings.projects![0]}
      lead={headings.projects![1]}
      ready={!!value && !!projects.data && !error}
    >
      {error ? (
        <ReadError
          error={error}
          retry={() => {
            void preferences.refetch();
            void projects.refetch();
          }}
        />
      ) : !value || !projects.data ? (
        <div role="status">{t('Loading settings…')}</div>
      ) : (
        <>
          <SettingRow
            title={t('Default project view')}
            description={t('The tab that opens when you open a project.')}
          >
            <Select
              label="defaultTab"
              value={value.defaultTab}
              disabled={settings.pending}
              className="w-auto! min-w-[180px]"
              options={['board', 'list', 'table', 'overview', 'timeline'].map((value) => ({
                value,
                label: t(value[0]!.toUpperCase() + value.slice(1)),
              }))}
              onValueChange={(defaultTab) => {
                void change({ defaultTab: defaultTab as MemberPreferencesDto['defaultTab'] });
              }}
            />
          </SettingRow>
          <SettingRow title={t('Show completed tasks on boards')}>
            <Toggle
              aria-label="showDoneBoard"
              checked={value.showDoneBoard}
              disabled={settings.pending}
              onCheckedChange={(showDoneBoard) => {
                void change({ showDoneBoard });
              }}
            />
          </SettingRow>
          {settings.error && (
            <Alert tone="danger">
              {settings.error}
              <Button
                size="sm"
                onClick={() => {
                  void change(draft);
                }}
              >
                {t('Retry')}
              </Button>
            </Alert>
          )}
          <SettingsBlock title={t('Archived projects')}>
            {projects.data.items.length ? (
              projects.data.items.map((item) => (
                <SettingRow
                  key={item.project.id}
                  title={
                    <span className="flex items-center gap-2">
                      <ProjectIcon project={item.project} size={14} />
                      <b className="font-medium">{item.project.name}</b>
                    </span>
                  }
                >
                  {item.access === 'allowed' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={commands.pending}
                        onClick={async () => {
                          const result = await commands.run('restoreProject', {
                            workspaceId,
                            projectId: item.project.id,
                            body: { expectedVersion: item.project.version },
                          });
                          if (result)
                            intentsServices.notice(
                              t('Restored {{value1}}', { value1: String(item.project.name) }),
                              result.data.undo ?? undefined,
                            );
                        }}
                      >
                        {t('Restore')}
                      </Button>
                      <Button
                        variant="dangerGhost"
                        size="sm"
                        disabled={commands.pending}
                        onClick={() => intents.deleteProject(item.project)}
                      >
                        {t('Delete')}
                      </Button>
                    </>
                  )}
                </SettingRow>
              ))
            ) : (
              <p className="py-3 text-muted">
                {t(
                  'No archived projects. Archived projects are hidden from the sidebar but keep all their tasks.',
                )}
              </p>
            )}
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigate({ to: `/w/${workspaceId}/archive` });
                }}
              >
                <Icon name="archive" size={13} />
                {t('Open archive')}
              </Button>
            </div>
          </SettingsBlock>
          {commands.error && <Alert tone="danger">{commands.error}</Alert>}
        </>
      )}
    </Surface>
  );
}
function SettingsPermissions({ data }: { data: BootstrapDto }) {
  useTranslation();
  const directory = usePeopleDirectory(data),
    { peopleDemo } = useDataRuntime(),
    cache = useQueryClient(),
    [error, setError] = useState(''),
    [notice, setNotice] = useState<ToastMessage[]>([]);
  function change(key: 'permCreate' | 'permGuests' | 'permPublic', checked: boolean) {
    if (!directory.enabled || !directory.context || !peopleDemo) return;
    try {
      const current = cache.getQueryData<typeof directory.state>(directory.key) ?? directory.state;
      cache.setQueryData(
        directory.key,
        peopleDemo.execute(directory.context, current.version, {
          kind: 'permissions',
          patch: { [key]: checked },
        }),
      );
      setError('');
      setNotice([
        {
          id: crypto.randomUUID(),
          message: t('Demo preference saved. Access permissions are unchanged.'),
          kind: 'info',
          duration: 2200,
        },
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? translateErrorMessage(cause.message)
          : t('Demo preferences could not be saved'),
      );
    }
  }
  return (
    <Surface
      section="permissions"
      title={headings.permissions![0]}
      lead={headings.permissions![1]}
      ready={directory.ready && !directory.error}
    >
      {directory.error ? (
        <ReadError
          error={directory.error}
          retry={() => {
            void directory.catalog.refetch();
            void directory.session.refetch();
            if (directory.context) void directory.demo.refetch();
          }}
        />
      ) : !directory.ready ? (
        <div role="status">{t('Loading settings…')}</div>
      ) : (
        <>
          {(
            [
              ['permCreate', 'Members can create projects', ''],
              [
                'permGuests',
                'Members can invite guests',
                'Guests only see projects they are added to.',
              ],
              [
                'permPublic',
                'Allow public share links',
                'Anyone with the link can view a project.',
              ],
            ] as const
          ).map(([key, title, description]) => (
            <SettingRow key={key} title={t(title)} description={t(description)}>
              <Toggle
                aria-label={key}
                checked={directory.state.permissionPreferences[key]}
                disabled={!directory.enabled}
                onCheckedChange={(checked) => change(key, checked)}
              />
            </SettingRow>
          ))}
          <SettingsBlock title={t('Role permissions')}>
            <div className="mt-3">
              <PermissionMatrix />
            </div>
          </SettingsBlock>
          {error && <Alert tone="danger">{error}</Alert>}
          <ToastViewport
            items={notice}
            onDismiss={(id) => setNotice((rows) => rows.filter((row) => row.id !== id))}
          />
        </>
      )}
    </Surface>
  );
}
const notificationRows: Record<
  NotificationSection,
  readonly [keyof NotificationPreferencesDto, string, string][]
> = {
  'notif-email': [
    ['emailMention', 'Mentions', 'When someone @mentions you.'],
    ['emailAssign', 'Assignments', 'When a task is assigned to you.'],
    ['emailComment', 'Comments', 'On tasks you created or are assigned.'],
    ['emailDigest', 'Daily digest', 'A summary of what changed, every weekday at 8:00.'],
  ],
  'notif-push': [
    ['pushMention', 'Mentions', ''],
    ['pushAssign', 'Assignments', ''],
    ['pushComment', 'Comments', ''],
    ['pushDue', 'Due date reminders', 'One day before a task is due.'],
  ],
  'notif-mentions': [
    ['mentionAll', '@mentions in comments and descriptions', ''],
    ['mentionTeam', '@team mentions', 'When your team is mentioned, e.g. @Product.'],
    ['mentionWorkspace', '@workspace mentions', 'Announcements to everyone.'],
  ],
  'notif-assign': [
    ['assignSelf', "When I'm assigned a task", ''],
    ['assignStatus', 'When my task changes status', ''],
    ['assignOverdue', 'When my task is overdue', ''],
  ],
};
function NotificationSettings({ section }: { section: NotificationSection }) {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    preferences = useStudioQuery('getNotificationPreferences', { workspaceId }),
    commands = useSettingsCommands(),
    [draft, setDraft] = useState<UpdateNotificationPreferencesInput>({}),
    [toasts, setToasts] = useState<ToastMessage[]>([]),
    value = preferences.data
      ? NotificationPreferencesSchema.parse({ ...preferences.data.data, ...draft })
      : null;
  async function change(patch: UpdateNotificationPreferencesInput) {
    if (commands.isPending()) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    if (await commands.run('updateNotificationPreferences', { workspaceId, body: next })) {
      setDraft({});
      setToasts([
        {
          id: crypto.randomUUID(),
          message: t('Notification preference saved. Email and push delivery are unavailable.'),
          kind: 'info',
          duration: 1500,
        },
      ]);
    }
  }
  return (
    <Surface
      section={section}
      title={headings[section]![0]}
      lead={headings[section]![1]}
      ready={!!value && !preferences.error}
    >
      {preferences.error ? (
        <ReadError
          error={preferences.error}
          retry={() => {
            void preferences.refetch();
          }}
        />
      ) : !value ? (
        <div role="status">{t('Loading settings…')}</div>
      ) : (
        <>
          {notificationRows[section].map(([key, title, description]) => (
            <SettingRow key={key} title={t(title)} description={t(description)}>
              <Toggle
                aria-label={key}
                aria-describedby="notification-delivery"
                checked={value[key]}
                disabled={commands.pending}
                onCheckedChange={(checked) => {
                  void change({ [key]: checked });
                }}
              />
            </SettingRow>
          ))}
          <p id="notification-delivery" className="sr-only">
            {t(
              'These controls save notification preferences. Email, scheduled digest, reminders, and push delivery are unavailable.',
            )}
          </p>
          {commands.error && (
            <Alert className="mt-3" tone="danger">
              {commands.error}
              <Button
                size="sm"
                onClick={() => {
                  void change(draft);
                }}
              >
                {t('Retry')}
              </Button>
            </Alert>
          )}
          <ToastViewport
            items={toasts}
            onDismiss={(id) => setToasts((rows) => rows.filter((row) => row.id !== id))}
          />
        </>
      )}
    </Surface>
  );
}
