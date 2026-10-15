import { translateErrorMessage } from '../../i18n/error-message';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import type { RefObject } from 'react';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Icon,
  Input,
  Select,
} from '@studio/ui';
import type { BootstrapDto, ProjectDto } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { sharingPermissions } from '../../data/sharing-demo';
import type { SharingDemoState, SharingPermission } from '../../data/sharing-demo';
import { useProjectSharing } from './sharing-queries';
import { MemberIdentity } from '../people/MemberIdentity';
export interface ShareDialogProps {
  returnFocus?: RefObject<HTMLElement | null>;
  project: ProjectDto;
  data: BootstrapDto;
  onClose: () => void;
  onNotice: (message: string, undo?: () => void) => void;
}
export function ShareDialog({ project, data, returnFocus, onClose, onNotice }: ShareDialogProps) {
  useTranslation();
  const { sharingDemo } = useDataRuntime(),
    cache = useQueryClient(),
    inviteRef = useRef<HTMLInputElement>(null),
    { members, catalog, session, demo, key } = useProjectSharing(project, data),
    [q, setQ] = useState(''),
    [permission, setPermission] = useState<SharingPermission>('Can edit'),
    [error, setError] = useState('');
  const capability = session.data?.data.capabilities.features.projectSharing,
    enabled =
      capability === 'demoOnly' &&
      !!sharingDemo &&
      !!demo.data &&
      catalog.data?.coverage === 'complete';
  const state =
    demo.data ??
    ({
      visibility: project.visibility,
      memberIds: project.memberIds,
      permissions: {},
      guests: [],
      version: 1,
    } as SharingDemoState);
  const people = [
    ...(catalog.data?.items ?? members.data?.data.map((row) => row.member) ?? []),
    ...state.guests,
  ];
  function write(next: Omit<SharingDemoState, 'version'>) {
    if (!enabled) {
      setError(t('Sharing changes are not available yet.'));
      return null;
    }
    try {
      const result = sharingDemo!.write(project, data.currentMember.id, state.version, next);
      cache.setQueryData(key, result);
      setError('');
      return result;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? translateErrorMessage(cause.message)
          : t('Sharing could not be updated'),
      );
      return null;
    }
  }
  function add(id: string) {
    if (
      write({
        ...state,
        memberIds: [...new Set([...state.memberIds, id])],
        permissions: { ...state.permissions, [id]: permission },
      })
    ) {
      setQ('');
      onNotice(t('Sharing updated for this demo.'));
    }
  }
  function invite() {
    if (!enabled) return;
    const text = q.trim(),
      existing = people.find(
        (member) =>
          member.name.toLowerCase() === text.toLowerCase() ||
          member.email.toLowerCase() === text.toLowerCase(),
      );
    if (existing) {
      add(existing.id);
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(text)) {
      setError(t('Enter a valid email address, like name@company.com'));
      return;
    }
    if (!enabled) return;
    const guest = sharingDemo!.guest(text);
    if (
      write({
        ...state,
        guests: [...state.guests, guest],
        memberIds: [...state.memberIds, guest.id],
        permissions: { ...state.permissions, [guest.id]: permission },
      })
    ) {
      setQ('');
      onNotice(
        t('Added {{value1}} to this demo. No invitation was sent.', { value1: String(text) }),
      );
    }
  }
  const matches = q
    ? people.filter(
        (member) =>
          !state.memberIds.includes(member.id) &&
          (member.name.toLowerCase().includes(q.toLowerCase()) ||
            member.email.toLowerCase().includes(q.toLowerCase())),
      )
    : [];
  const accessPeople = state.memberIds.map(
    (id) =>
      people.find((member) => member.id === id) ?? data.members.find((member) => member.id === id),
  );
  const entryRevision = JSON.stringify({
    q,
    permission,
    version: state.version,
    error,
    capability,
    enabled,
    access: accessPeople.map((member) =>
      member
        ? {
            id: member.id,
            name: member.name,
            avatarColor: member.avatarColor,
            email: people.find((person) => person.id === member.id)?.email ?? null,
          }
        : null,
    ),
    matches: matches.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      avatarColor: member.avatarColor,
    })),
  });
  return (
    <Dialog
      entryRevision={entryRevision}
      open
      initialFocus={inviteRef}
      {...(returnFocus ? { returnFocus } : {})}
      aria-labelledby="share-title"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      data-project-share
    >
      <DialogHeader
        title={t('Share “{{value1}}”', { value1: String(project.name) })}
        titleId="share-title"
        description=""
        onClose={onClose}
      />
      <DialogBody>
        {capability === 'unavailable' && (
          <Alert tone="info">{t('Sharing changes are not available yet.')}</Alert>
        )}
        <form
          className="flex items-center gap-[6px]"
          onSubmit={(event) => {
            event.preventDefault();
            invite();
          }}
        >
          <Input
            ref={inviteRef}
            aria-label={t('Invite by email')}
            className="min-w-0 flex-1"
            placeholder={t('Add people by name or email')}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <Select
            label={t('Permission')}
            className="w-[132px]!"
            value={permission}
            options={sharingPermissions.map((value) => ({ value, label: t(value) }))}
            onValueChange={(value) => setPermission(value as SharingPermission)}
            disabled={!enabled}
          />
          <Button variant="primary" disabled={!enabled} onClick={invite}>
            {t('Invite')}
          </Button>
        </form>
        {q && (
          <div className="rounded-lg border border-solid border-border p-1">
            {matches.length ? (
              matches.map((member) => (
                <button
                  key={member.id}
                  className="flex min-h-[30px] w-full items-center gap-2 rounded-sm px-[7px] text-left text-sm source-hover:bg-surface-2"
                  disabled={!enabled}
                  onClick={() => add(member.id)}
                >
                  <MemberIdentity member={member} className="static!" avatarOnly />
                  {member.name}
                  <span className="ml-auto text-xs text-muted">{member.email}</span>
                </button>
              ))
            ) : (
              <div className="px-[7px] py-[5px] text-sm text-muted">
                {q.includes('@')
                  ? t('Press Invite to add {{email}} to this demo', { email: q })
                  : t('No matching members — enter an email to add someone new')}
              </div>
            )}
          </div>
        )}
        <div>
          <div className="mb-1 text-2xs font-semibold uppercase tracking-[.07em] text-muted">
            {t('People with access')}
          </div>
          {state.memberIds.map((id, index) => {
            const member = accessPeople[index];
            if (!member) return null;
            return (
              <div key={id} className="flex h-11 items-center gap-2">
                <MemberIdentity member={member} className="static!" size="md" avatarOnly />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">
                    {member.name}
                    {id === data.currentMember.id && (
                      <span className="font-normal text-muted">
                        {'  '}
                        {t('(you)')}
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-muted">
                    {people.find((person) => person.id === id)?.email ?? t('Loading details…')}
                    {id === project.leadId ? t('· Project lead') : ''}
                  </div>
                </div>
                {id === project.leadId ? (
                  <span className="pr-2 text-sm text-secondary">{t('Full access')}</span>
                ) : (
                  <Select
                    label={t('Permission for {{value1}}', { value1: String(member.name) })}
                    className="h-[26px]! w-auto! border-transparent! bg-transparent! text-xs!"
                    value={state.permissions[id] ?? 'Can edit'}
                    options={[
                      ...sharingPermissions.map((value) => ({ value, label: t(value) })),
                      { value: '__remove', label: t('Remove access') },
                    ]}
                    disabled={!enabled}
                    onValueChange={(value) => {
                      if (value === '__remove') {
                        const previous = state;
                        const result = write({
                          ...state,
                          memberIds: state.memberIds.filter((memberId) => memberId !== id),
                        });
                        if (result)
                          onNotice(
                            t('Removed {{value1}} from this demo', { value1: String(member.name) }),
                            () => {
                              try {
                                const current = cache.getQueryData<SharingDemoState>(key)!;
                                if (current.version !== result.version)
                                  throw Error('Sharing changed. Undo cannot be applied.');
                                const restored = sharingDemo!.write(
                                  project,
                                  data.currentMember.id,
                                  result.version,
                                  {
                                    ...current,
                                    memberIds: previous.memberIds,
                                    permissions: {
                                      ...current.permissions,
                                      [id]: previous.permissions[id] ?? 'Can edit',
                                    },
                                  },
                                );
                                cache.setQueryData(key, restored);
                              } catch (cause) {
                                const message =
                                  cause instanceof Error
                                    ? translateErrorMessage(cause.message)
                                    : t('Sharing could not be restored.');
                                setError(message);
                                onNotice(message);
                              }
                            },
                          );
                      } else if (
                        write({
                          ...state,
                          permissions: { ...state.permissions, [id]: value as SharingPermission },
                        })
                      )
                        onNotice(
                          t('{{value1}}: {{value2}} in this demo', {
                            value1: String(member.name),
                            value2: String(value),
                          }),
                        );
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="border-0 border-t border-solid border-divider pt-3">
          <div className="mb-2 text-2xs font-semibold uppercase tracking-[.07em] text-muted">
            {t('General access')}
          </div>
          <div className="flex items-center gap-[10px]">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-sm text-secondary"
              style={{ background: 'color-mix(in srgb,var(--text-2) 13%,transparent)' }}
            >
              <Icon name={state.visibility === 'private' ? 'lock' : 'building-2'} size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <Select
                label={t('General access')}
                className="h-7! w-auto! border-transparent! pl-1! font-medium!"
                value={state.visibility}
                options={[
                  { value: 'private', label: t('Only people invited') },
                  {
                    value: 'workspace',
                    label: t('Everyone at {{value1}}', { value1: String(data.workspace.name) }),
                  },
                ]}
                disabled={!enabled}
                onValueChange={(value) => {
                  if (write({ ...state, visibility: value as 'private' | 'workspace' }))
                    onNotice(t('General access updated for this demo.'));
                }}
              />
              <div className="pl-1 text-[11.5px] text-muted">
                {state.visibility === 'private'
                  ? t('Only people listed above can open this project.')
                  : t('Anyone in the workspace can view and comment.')}
              </div>
            </div>
          </div>
        </div>
        {(error || members.error || catalog.error) && (
          <Alert tone="danger">
            {error ||
              translateErrorMessage(members.error?.message) ||
              translateErrorMessage(catalog.error?.message)}
          </Alert>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `${location.origin}/w/${project.workspaceId}/projects/${project.id}/board`,
              );
              onNotice(t('Link copied'));
            } catch {
              setError(t('The link could not be copied.'));
            }
          }}
        >
          <Icon name="link" size={14} />
          {t('Copy link')}
        </Button>
        <span className="flex-1" />
        <Button variant="primary" onClick={onClose}>
          {t('Done')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
