import { translateErrorMessage } from '../../i18n/error-message';
import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Icon,
  Menu,
  MenuItem,
  MenuSeparator,
  ToastViewport,
} from '@studio/ui';
import type { ToastMessage } from '@studio/ui';
import { EntityIdSchema } from '@studio/contracts/api';
import type { BootstrapDto } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import type { PeopleDemoCommand } from '../../data/people-demo';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { PeopleIntentContext } from './people-intents';
import { usePeopleDirectory, canAdministerMember } from './people-query';
import { InviteDialog } from './InviteDialog';
import { RolePicker } from './RolePicker';
export interface PeopleOverlayHostProps {
  data: BootstrapDto;
  children: ReactNode;
}
export function PeopleOverlayHost({ data, children }: PeopleOverlayHostProps) {
  useTranslation();
  const directory = usePeopleDirectory(data),
    { peopleDemo } = useDataRuntime(),
    cache = useQueryClient(),
    navigate = useNavigate(),
    tasks = useWorkspaceIntents(),
    projects = useAppServices(),
    opener = useRef<HTMLElement | null>(null),
    cancel = useRef<HTMLButtonElement>(null),
    [invite, setInvite] = useState(false),
    [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null),
    [role, setRole] = useState<{ id: string; anchor: HTMLElement } | null>(null),
    [removeId, setRemoveId] = useState<string | null>(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [toasts, setToasts] = useState<ToastMessage[]>([]);
  const member = directory.members.find((member) => member.id === menu?.id),
    roleMember = directory.members.find((member) => member.id === role?.id),
    removeMember = directory.members.find((member) => member.id === removeId),
    notice = (message: string, undo?: () => void) =>
      setToasts((rows) => [
        {
          id: crypto.randomUUID(),
          message,
          duration: undo ? 5000 : 4200,
          ...(undo ? { action: { label: t('Undo'), onAction: undo } } : {}),
        },
        ...rows,
      ]);
  const prepare = () => {
    projects.surfaceOpened();
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError('');
  };
  async function execute(command: PeopleDemoCommand) {
    if (!directory.context || !peopleDemo || !directory.enabled || pending) return undefined;
    setPending(true);
    try {
      const current = cache.getQueryData<typeof directory.state>(directory.key) ?? directory.state,
        result = peopleDemo.execute(directory.context, current.version, command);
      cache.setQueryData(directory.key, result);
      setError('');
      return result;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? translateErrorMessage(cause.message)
          : t('Members could not be updated'),
      );
      return undefined;
    } finally {
      setPending(false);
    }
  }
  const openProfile = (id: string) => {
      void navigate({ to: `/w/${data.workspace.id}/members/${id}` });
    },
    assign = (id: string) => {
      const selected = directory.members.find((member) => member.id === id);
      if (!selected || selected.demo || selected.status === 'deactivated') {
        notice(t('This demo person cannot be assigned a real task.'));
        return;
      }
      tasks.openTaskForm(undefined, { assigneeId: EntityIdSchema.parse(id) });
    },
    copy = async (text: string, message: string) => {
      try {
        await navigator.clipboard.writeText(text);
        notice(message);
      } catch {
        setToasts((rows) => [
          {
            id: crypto.randomUUID(),
            message: "Copy isn't available here — " + text,
            kind: 'info',
            duration: 6000,
          },
          ...rows,
        ]);
      }
    };
  return (
    <PeopleIntentContext
      value={{
        removeMember: (id) => {
          prepare();
          setRemoveId(id);
        },
        changeRole: (id, role) => {
          const selected = directory.members.find((member) => member.id === id);
          if (selected)
            void execute({ kind: 'role', memberId: id, role }).then((result) => {
              if (result)
                notice(
                  t('{{value1}} is now {{value2}} in this demo.', {
                    value1: String(selected.name),
                    value2: String(role),
                  }),
                );
            });
        },
        invite: () => {
          prepare();
          setInvite(true);
        },
        openProfile,
        assign,
        memberMenu: (id, anchor) => {
          prepare();
          setMenu({ id, anchor });
        },
      }}
    >
      {children}
      {invite && (
        <InviteDialog
          data={data}
          enabled={directory.enabled}
          returnFocus={opener}
          error={error || directory.error?.message || ''}
          pending={pending}
          onClose={() => setInvite(false)}
          onCopy={() => {
            void copy(
              `https://hoadev.com/join/${data.workspace.slug}-7f3k2`,
              'Demo invite link copied',
            );
          }}
          onSubmit={async (command) => {
            const result = await execute(command);
            if (!result) return false;
            setInvite(false);
            notice(
              t('{{value1}} pending invitation(s) added to this demo. No email was sent.', {
                value1: String(result.invitations.length - directory.state.invitations.length),
              }),
            );
            return true;
          }}
        />
      )}
      <Menu
        className="people-menu"
        open={!!member}
        anchor={{ current: menu?.anchor ?? null }}
        label={t('Member options')}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
      >
        {member && (
          <>
            <MenuItem
              icon={<Icon name="user" size={15} />}
              onSelect={() => {
                setMenu(null);
                openProfile(member.id);
              }}
            >
              {t('View profile')}
            </MenuItem>
            <MenuItem
              icon={<Icon name="plus" size={15} />}
              onSelect={() => {
                setMenu(null);
                assign(member.id);
              }}
            >
              {t('Assign a task')}
            </MenuItem>
            <MenuItem
              icon={<Icon name="mail" size={15} />}
              onSelect={() => {
                setMenu(null);
                void copy(member.email, 'Email copied');
              }}
            >
              {t('Copy email')}
            </MenuItem>
            {canAdministerMember(member, data.currentMember.id, directory.enabled) && (
              <>
                <MenuItem
                  icon={<Icon name="shield" size={15} />}
                  onSelect={() => {
                    setRole({ id: member.id, anchor: menu!.anchor });
                    setMenu(null);
                  }}
                >
                  {t('Change role…')}
                </MenuItem>
                {member.status === 'invited' && (
                  <MenuItem
                    icon={<Icon name="send" size={15} />}
                    onSelect={async () => {
                      setMenu(null);
                      if (await execute({ kind: 'resend', memberId: member.id }))
                        notice(
                          t('Demo invite renewed for {{value1}}. No email was sent.', {
                            value1: String(member.email),
                          }),
                        );
                    }}
                  >
                    {t('Resend invite')}
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<Icon name="user-minus" size={15} />}
                  onSelect={() => {
                    setMenu(null);
                    setRemoveId(member.id);
                  }}
                >
                  {t('Remove from workspace')}
                </MenuItem>
              </>
            )}
          </>
        )}
      </Menu>
      {roleMember && (
        <span className="hidden">
          <RolePicker
            member={roleMember}
            open
            anchor={role?.anchor ?? null}
            onOpenChange={(open) => {
              if (!open) setRole(null);
            }}
            onChange={async (value) => {
              if (await execute({ kind: 'role', memberId: roleMember.id, role: value }))
                notice(
                  t('{{value1}} is now {{value2}} in this demo.', {
                    value1: String(roleMember.name),
                    value2: String(value),
                  }),
                );
            }}
          />
        </span>
      )}
      {removeMember && (
        <Dialog
          open
          size="sm"
          initialFocus={cancel}
          returnFocus={opener}
          aria-labelledby="member-remove-title"
          entryRevision={error}
          onOpenChange={(open) => {
            if (!open && !pending) setRemoveId(null);
          }}
          data-member-remove
        >
          <DialogBody className="pt-[18px]! gap-[10px]!">
            <div className="flex items-start gap-3">
              <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-red-soft text-red">
                <Icon name="user-minus" size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="member-remove-title" className="mt-1 mb-[6px] text-[15px] font-semibold">
                  {t('Remove')} {removeMember.name}
                  {'?'}
                </h2>
                <p className="m-0 text-[13px] leading-[1.55] text-secondary">
                  {t('Hide')} {removeMember.name}
                  {'  '}
                  {t(
                    'from this demo directory. Account access, permissions and tasks stay unchanged.',
                  )}
                </p>
              </div>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
          </DialogBody>
          <DialogFooter>
            <span className="flex-1" />
            <Button
              ref={cancel}
              variant="secondary"
              disabled={pending}
              onClick={() => setRemoveId(null)}
            >
              {t('Cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={async () => {
                const result = await execute({ kind: 'remove', memberId: removeMember.id });
                if (!result) return;
                setRemoveId(null);
                const removed = removeMember;
                notice(
                  t('Removed {{value1}} from this demo', { value1: String(removed.name) }),
                  () => {
                    void execute({
                      kind: 'undoRemove',
                      memberId: removed.id,
                      removedVersion: result.version,
                    });
                  },
                );
                if (location.pathname.includes(removed.id))
                  void navigate({ to: `/w/${data.workspace.id}/members` });
              }}
            >
              {t('Remove member')}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
      {!invite && !removeId && error && (
        <div className="fixed bottom-4 right-4 z-[90]">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <ToastViewport
        items={toasts}
        onDismiss={(id) => setToasts((rows) => rows.filter((row) => row.id !== id))}
      />
    </PeopleIntentContext>
  );
}
