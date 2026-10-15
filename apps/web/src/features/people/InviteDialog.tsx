import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  Icon,
  Select,
  Textarea,
} from '@studio/ui';
import type { BootstrapDto } from '@studio/contracts/api';
interface InviteIntent {
  kind: 'invite';
  emails: string;
  role: 'Admin' | 'Member' | 'Guest';
  teamId: string | null;
}
import { validateInvite } from './invite-validation';
export interface InviteDialogProps {
  data: BootstrapDto;
  enabled: boolean;
  error?: string;
  pending: boolean;
  returnFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSubmit: (command: InviteIntent) => Promise<boolean>;
  onCopy: () => void;
}
export function InviteDialog({
  data,
  enabled,
  error,
  pending,
  returnFocus,
  onClose,
  onSubmit,
  onCopy,
}: InviteDialogProps) {
  useTranslation();
  const input = useRef<HTMLTextAreaElement>(null),
    [emails, setEmails] = useState(''),
    [role, setRole] = useState<'Member' | 'Admin' | 'Guest'>('Member'),
    [teamId, setTeamId] = useState<string | null>(data.teams[0]?.id ?? null),
    [validation, setValidation] = useState('');
  const effectiveTeamId = data.teams.some((team) => team.id === teamId) ? teamId : null;
  const submit = async () => {
    try {
      validateInvite(emails);
      setValidation('');
      await onSubmit({ kind: 'invite', emails, role, teamId: effectiveTeamId });
    } catch (cause) {
      setValidation(cause instanceof Error ? cause.message : t('Check the email addresses'));
    }
  };
  return (
    <Dialog
      open
      initialFocus={input}
      returnFocus={returnFocus}
      entryRevision={`${emails}/${role}/${teamId}/${validation}/${error}/${enabled}`}
      aria-labelledby="invite-title"
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      data-invite-dialog
    >
      <DialogHeader
        title={t('Invite to {{value1}}', { value1: String(data.workspace.name) })}
        titleId="invite-title"
        description={t('Demo pending people; no email is sent.')}
        onClose={onClose}
      />
      <DialogBody>
        <form
          className="flex flex-col gap-[14px]"
          id="invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
        >
          <Field
            label={t('Email addresses')}
            controlId="inv-emails"
            {...(validation
              ? { error: validation }
              : { hint: t('Separate multiple addresses with commas.') })}
          >
            <Textarea
              className={
                validation
                  ? 'border-border-strong! shadow-none! focus:border-accent! focus:[box-shadow:0_0_0_3px_var(--accent-soft)]!'
                  : ''
              }
              error={!!validation}
              aria-describedby="inv-emails-description"
              ref={input}
              id="inv-emails"
              rows={3}
              placeholder="name@company.com, another@company.com"
              value={emails}
              disabled={pending}
              onChange={(event) => setEmails(event.target.value)}
            />
          </Field>
          <div className="flex gap-3">
            <Field label={t('Role')} className="flex-1">
              <Select
                label={t('Role')}
                value={role}
                disabled={pending}
                options={['Member', 'Admin', 'Guest'].map((value) => ({ value, label: t(value) }))}
                onValueChange={(value) => setRole(value as typeof role)}
              />
            </Field>
            <Field label={t('Team')} className="flex-1">
              <Select
                label={t('Team')}
                value={effectiveTeamId ?? ''}
                disabled={pending}
                options={
                  data.teams.length
                    ? data.teams.map((team) => ({ value: team.id, label: team.name }))
                    : [{ value: '', label: t('No team') }]
                }
                onValueChange={setTeamId}
              />
            </Field>
          </div>
          <Alert tone="info">
            <Icon name="info" size={14} className="mt-px" />
            <span>
              <b>{t('Guests')}</b>
              {'  '}
              {t("can only see projects they're added to and can't create projects.")}
            </span>
          </Alert>
        </form>
        {!enabled && (
          <Alert tone="info">{t('Member administration is unavailable for this account.')}</Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onCopy}>
          <Icon name="link" size={14} />
          {t('Copy invite link')}
        </Button>
        <span className="flex-1" />
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button
          variant="primary"
          type="submit"
          form="invite-form"
          disabled={!enabled || pending}
          loading={pending}
        >
          {t('Send invites')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
