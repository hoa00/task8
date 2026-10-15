import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import type { RefObject } from 'react';
import { useId, useRef, useState } from 'react';
import {
  Alert,
  AppearanceFields,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  Icon,
  Input,
  Select,
  Textarea,
} from '@studio/ui';
import type { IconName } from '@studio/ui';
import { EntityIdSchema, DateOnlySchema } from '@studio/contracts/api';
import type { BootstrapDto, CreateProjectInput, ProjectDto } from '@studio/contracts/api';
import { addDateDays } from '@studio/domain';
import { useDataRuntime } from '../../data/context';
import { useCompleteMembers } from './catalogue';
import { ProjectIcon } from './ProjectComponents';
export interface ProjectFormDialogProps {
  returnFocus?: RefObject<HTMLElement | null>;
  data: BootstrapDto;
  project?: ProjectDto;
  pending: boolean;
  error: string;
  edit?: boolean;
  unavailable?: boolean;
  onClose: () => void;
  onSubmit: (body: CreateProjectInput) => Promise<void>;
}
export function ProjectFormDialog({
  data,
  returnFocus,
  project,
  pending,
  error,
  edit = !!project,
  unavailable = false,
  onClose,
  onSubmit,
}: ProjectFormDialogProps) {
  useTranslation();
  const { clock } = useDataRuntime(),
    members = useCompleteMembers(data.workspace.id),
    formId = useId(),
    disabled = pending || unavailable,
    nameRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState<CreateProjectInput>({
      name: project?.name ?? '',
      description: project?.description ?? '',
      icon: project?.icon ?? 'folder',
      color: project?.color ?? '#5A67D8',
      teamId: project ? project.teamId : data.currentMember.teamId,
      leadId: project?.leadId ?? data.currentMember.id,
      dueDate: project ? project.dueDate : addDateDays(clock.today(), 30),
      templateId: 'blank',
    }),
    [validation, setValidation] = useState(''),
    [actionRevision, setActionRevision] = useState(0);
  const change = <K extends keyof CreateProjectInput>(key: K, value: CreateProjectInput[K]) =>
    setBody((current) => ({ ...current, [key]: value }));
  const effectiveTeamId =
    body.teamId && data.teams.some((team) => team.id === body.teamId) ? body.teamId : null;
  const submit = () => {
    if (pending || unavailable) return;
    if (!body.name.trim()) {
      setValidation(t('Give the project a name'));
      nameRef.current?.focus();
      return;
    }
    setValidation('');
    void onSubmit({ ...body, name: body.name.trim(), teamId: effectiveTeamId });
  };
  return (
    <Dialog
      entryRevision={`${actionRevision}/${validation}/${error}/${unavailable}`}
      open
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      }}
      {...(returnFocus ? { returnFocus } : {})}
      aria-labelledby="project-form-title"
      initialFocus={nameRef}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      data-project-form
    >
      <DialogHeader
        title={edit ? t('Project settings') : t('New project')}
        titleId="project-form-title"
        description={
          edit ? '' : t('Projects hold tasks, files, and conversations for one body of work.')
        }
        onClose={() => {
          if (!pending) onClose();
        }}
      />
      <DialogBody
        as="form"
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-start gap-[10px]">
          <ProjectIcon project={body} large size={18} className="mt-[22px]" />
          <Field
            label={t('Project name')}
            controlId="project-name"
            className="min-w-0 flex-1"
            error={validation}
          >
            <Input
              disabled={disabled}
              ref={nameRef}
              id="project-name"
              placeholder={t('e.g. Website Redesign')}
              value={body.name}
              error={!!validation}
              onChange={(event) => {
                change('name', event.target.value);
                if (event.target.value.trim()) setValidation('');
              }}
            />
          </Field>
        </div>
        <Field label={t('Description')} controlId="project-description">
          <Textarea
            disabled={disabled}
            id="project-description"
            rows={2}
            placeholder={t('What is this project about?')}
            value={body.description}
            onChange={(event) => change('description', event.target.value)}
          />
        </Field>
        <AppearanceFields
          icons={data.catalogs.projectIcons}
          colors={data.catalogs.projectColors}
          icon={body.icon}
          color={body.color}
          disabled={disabled}
          onIconChange={(icon) => {
            setActionRevision((current) => current + 1);
            change('icon', icon);
          }}
          onColorChange={(color) => {
            setActionRevision((current) => current + 1);
            change('color', color);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Field label={t('Team')} className="min-w-[150px] flex-1">
            <Select
              disabled={disabled}
              label={t('Team')}
              value={effectiveTeamId ?? ''}
              options={[
                { value: '', label: t('No team') },
                ...data.teams.map((team) => ({ value: team.id, label: team.name })),
              ]}
              onValueChange={(value) =>
                change('teamId', value ? EntityIdSchema.parse(value) : null)
              }
            />
          </Field>
          <Field label={t('Lead')} className="min-w-[150px] flex-1">
            <Select
              disabled={disabled}
              label={t('Lead')}
              value={body.leadId}
              options={(members.data?.items ?? [])
                .filter((member) => member.status === 'active')
                .map((member) => ({ value: member.id, label: member.name }))}
              onValueChange={(value) => change('leadId', EntityIdSchema.parse(value))}
            />
          </Field>
          <Field label={t('Target date')} controlId="project-due" className="min-w-[150px] flex-1">
            <Input
              disabled={disabled}
              type="date"
              id="project-due"
              value={body.dueDate ?? ''}
              onChange={(event) =>
                change(
                  'dueDate',
                  event.target.value ? DateOnlySchema.parse(event.target.value) : null,
                )
              }
            />
          </Field>
        </div>
        {!edit && (
          <div className="flex flex-col gap-[6px]">
            <span className="text-sm font-medium">{t('Template')}</span>
            <div className="project-templates" role="radiogroup" aria-label={t('Template')}>
              {data.catalogs.templates.map((template) => (
                <button
                  key={template.id}
                  disabled={disabled}
                  type="button"
                  role="radio"
                  aria-checked={body.templateId === template.id}
                  className={`flex flex-col items-start gap-2 rounded-lg border border-solid bg-surface p-[10px] text-left ${body.templateId === template.id ? 'border-accent shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-border source-hover:border-border-strong'}`}
                  onClick={() => {
                    setActionRevision((current) => current + 1);
                    setBody((current) => ({
                      ...current,
                      templateId: template.id,
                      icon:
                        current.icon === 'folder' && template.icon !== 'file'
                          ? (template.icon as CreateProjectInput['icon'])
                          : current.icon,
                    }));
                  }}
                >
                  <Icon
                    name={template.icon as IconName}
                    size={16}
                    className={body.templateId === template.id ? 'text-accent' : 'text-secondary'}
                  />
                  <b className="text-[12.5px] font-medium">{t(template.name)}</b>
                  <span className="text-xs text-muted">
                    {template.tasks.length
                      ? t('{{count}} starter tasks', { count: template.tasks.length })
                      : t(template.description)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {unavailable && (
          <Alert tone="danger">
            {t('This project is no longer available. Close this form and return to Projects.')}
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </DialogBody>
      <DialogFooter>
        <span className="flex-1" />
        <Button variant="secondary" disabled={pending} onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button
          variant="primary"
          type="submit"
          form={formId}
          loading={pending}
          disabled={unavailable}
        >
          {edit ? t('Save changes') : t('Create project')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
