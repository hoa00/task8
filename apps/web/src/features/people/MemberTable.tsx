import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { EmptyState, Icon, IconButton, Panel } from '@studio/ui';
import type { IconName } from '@studio/ui';
import type { BootstrapDto, TaskDto } from '@studio/contracts/api';
import type { DirectoryMember } from './types';
import { MemberIdentity } from './MemberIdentity';
import { MemberStatus } from './MemberStatus';
import { RolePicker } from './RolePicker';
import { canAdministerMember } from './people-query';
import { ago } from '../tasks/date-display';
export interface MemberTableProps {
  members: readonly DirectoryMember[];
  data: BootstrapDto;
  tasks: readonly TaskDto[];
  now: string;
  enabled: boolean;
  onProfile: (id: string) => void;
  onMenu: (id: string, anchor: HTMLElement) => void;
  onRole: (id: string, role: 'Admin' | 'Member' | 'Guest') => void;
}
export function MemberTable({
  members,
  data,
  tasks,
  now,
  enabled,
  onProfile,
  onMenu,
  onRole,
}: MemberTableProps) {
  useTranslation();
  return (
    <Panel className="overflow-x-auto" data-member-table>
      {members.length ? (
        <table className="people-table min-w-[880px]">
          <thead>
            <tr>
              {[
                'Member',
                'Role',
                'Team',
                'Active projects',
                'Tasks',
                'Last active',
                'Status',
                '',
              ].map((label) => (
                <th
                  key={label}
                  className={
                    label === 'Member'
                      ? 'pl-[14px]!'
                      : ['Role', 'Team', 'Last active', 'Status'].includes(label)
                        ? 'text-left!'
                        : ''
                  }
                >
                  {t(label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const team = data.teams.find((team) => team.id === member.teamId),
                active = data.projects.filter(
                  (item) =>
                    item.access === 'allowed' &&
                    item.project.status !== 'complete' &&
                    item.project.memberIds.includes(member.id),
                ).length,
                open = tasks.filter(
                  (task) => task.assigneeId === member.id && task.status !== 'done',
                ).length;
              return (
                <tr
                  key={member.id}
                  data-member-id={member.id}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onMenu(member.id, event.currentTarget);
                  }}
                >
                  <td className="pl-[14px]!">
                    <button
                      className="flex items-center gap-[10px] text-left"
                      onClick={() => onProfile(member.id)}
                    >
                      <MemberIdentity member={member} avatarOnly size="md" />
                      <span className="flex flex-col">
                        <b className="font-medium">
                          {member.name}
                          {member.id === data.currentMember.id && (
                            <span className="font-normal text-muted">
                              {'  '}
                              {t('(you)')}
                            </span>
                          )}
                        </b>
                        <span className="text-xs text-muted">{member.email}</span>
                      </span>
                    </button>
                  </td>
                  <td className="text-left!">
                    <RolePicker
                      member={member}
                      readonly={!canAdministerMember(member, data.currentMember.id, enabled)}
                      onChange={(role) => onRole(member.id, role)}
                    />
                  </td>
                  <td className="text-left!">
                    <span className="flex items-center gap-2">
                      {team && <Icon name={team.icon as IconName} size={13} />}{' '}
                      {team?.name ?? t('No team')}
                    </span>
                  </td>
                  <td className="tabular-nums">{active}</td>
                  <td className="tabular-nums">{open}</td>
                  <td className="text-left! text-secondary">
                    {!member.lastSeenAt ? (
                      '—'
                    ) : Date.parse(now) - Date.parse(member.lastSeenAt) < 5 * 60000 ? (
                      <span className="text-green">{t('Online')}</span>
                    ) : (
                      ago(member.lastSeenAt, now)
                    )}
                  </td>
                  <td className="text-left!">
                    <MemberStatus status={member.status} />
                  </td>
                  <td>
                    <IconButton
                      size="sm"
                      aria-label={t('Member options')}
                      onClick={(event) => onMenu(member.id, event.currentTarget)}
                    >
                      <Icon name="ellipsis" size={14} />
                    </IconButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <EmptyState
          icon="search-x"
          heading={t('No results found')}
          description={t('No members match that search.')}
          size="sm"
        />
      )}
    </Panel>
  );
}
