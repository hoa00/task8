import { translate as t } from '../../../i18n/i18n';
import { useTranslation } from '../../../i18n/useTranslation';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Checkbox, Icon, IconButton, Textarea, useOverlayInitialState } from '@studio/ui';
import type { DateOnly, BootstrapDto, SubtaskDto, TaskDto } from '@studio/contracts/api';
import { MemberIdentity } from '../../people/MemberIdentity';
import { AssigneeField, TaskDateField } from '../fields';
import { formatTaskDate } from '../date-display';
import type { useSubtaskCommands } from './useSubtaskCommands';
export interface SubtaskListProps {
  today: DateOnly;
  task: TaskDto;
  subtasks: readonly SubtaskDto[];
  data: BootstrapDto;
  commands: ReturnType<typeof useSubtaskCommands>;
  onOpen: (id: string) => void;
}
export function SubtaskList({ today, subtasks, data, commands, onOpen }: SubtaskListProps) {
  useTranslation();
  const [title, setTitle] = useState(''),
    completed = subtasks.filter((row) => row.done).length;
  async function add() {
    const value = title.trim();
    if (value && (await commands.create(value))) setTitle('');
  }
  return (
    <section className="task-detail-section">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="m-0 text-body font-semibold">{t('Subtasks')}</h3>
        <span className="text-xs tabular-nums text-muted">
          {completed}
          {'/'}
          {subtasks.length}
        </span>
        {!!subtasks.length && (
          <span className="flex w-[90px]">
            <span className="h-1 w-full overflow-hidden rounded-[4px] bg-surface-3">
              <i
                className={`block h-full w-full rounded-[4px] ${completed === subtasks.length ? 'bg-green' : 'bg-accent'}`}
                style={{
                  transform: `scaleX(${Math.round((completed / subtasks.length) * 100) / 100})`,
                  transformOrigin: 'left',
                }}
              />
            </span>
          </span>
        )}
      </div>
      {subtasks.map((child) => (
        <div
          key={child.id}
          data-subtask-id={child.id}
          className="group/subtask flex min-h-8 items-center gap-[9px] rounded-sm px-[6px] text-body source-hover:bg-surface-2"
        >
          <Checkbox
            checked={child.done}
            disabled={commands.pending}
            aria-label={t('{{value1}} subtask {{value2}}', {
              value1: String(child.done ? t('Reopen') : t('Complete')),
              value2: String(child.title),
            })}
            onCheckedChange={(done) => {
              void commands.update(child.id, { done });
            }}
          />
          <button
            className={`min-w-0 flex-1 truncate rounded-[4px] py-1 text-left source-hover:underline source-hover:decoration-border-strong source-hover:underline-offset-[3px] ${child.done ? 'text-muted line-through' : ''}`}
            onClick={() => onOpen(child.id)}
          >
            {child.title}
          </button>
          {child.dueDate && (
            <span
              className={`flex shrink-0 items-center gap-1 text-[11.5px] ${!child.done && child.dueDate < today ? 'text-red' : 'text-muted'}`}
            >
              <Icon name="calendar" size={12} />
              {formatTaskDate(child.dueDate, today)}
            </span>
          )}
          {child.assigneeId && (
            <MemberIdentity
              member={data.members.find((member) => member.id === child.assigneeId) ?? null}
              avatarOnly
              className="static!"
            />
          )}
          <IconButton
            className="ml-auto opacity-0 group-hover/subtask:opacity-100"
            size="xs"
            aria-label={t('Open subtask details')}
            tabIndex={-1}
            onClick={() => onOpen(child.id)}
          >
            <Icon name="chevron-right" size={14} />
          </IconButton>
        </div>
      ))}
      <div className="flex min-h-8 items-center gap-[9px] rounded-sm px-[6px] text-body text-muted">
        <Icon name="plus" size={15} />
        <input
          className="task-inline-input"
          value={title}
          placeholder={t('Add subtask')}
          aria-label={t('Add subtask')}
          disabled={commands.pending}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void add();
            }
          }}
        />
      </div>
      {commands.error && (
        <p role="alert" className="text-xs text-red">
          {commands.error}
        </p>
      )}
    </section>
  );
}
export interface SubtaskDetailProps extends SubtaskListProps {
  draft?: { title: string; note: string };
  onDraftChange: (draft: { title: string; note: string }) => void;
  subtask: SubtaskDto;
  onClose: () => void;
  onPromoted: (task: TaskDto) => void;
}
export function SubtaskDetail({
  today,
  task,
  subtask,
  subtasks,
  data,
  commands,
  onClose,
  onOpen,
  onPromoted,
  draft,
  onDraftChange,
}: SubtaskDetailProps) {
  useTranslation();
  const overlayState = useOverlayInitialState();
  const [title, setTitle] = useState(draft?.title ?? subtask.title),
    [note, setNote] = useState(draft?.note ?? subtask.note),
    [field, setField] = useState<'assignee' | 'due' | null>(null),
    [validation, setValidation] = useState(''),
    ref = useRef<HTMLTextAreaElement>(null),
    index = subtasks.findIndex((row) => row.id === subtask.id);
  useLayoutEffect(() => {
    if (overlayState === 'default') ref.current?.focus({ preventScroll: true });
  }, [overlayState]);
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [title]);
  async function saveTitle() {
    if (!title.trim()) {
      setValidation(t('Give the subtask a name'));
      return;
    }
    if (title.trim() !== subtask.title && (await commands.update(subtask.id, { title })))
      setValidation('');
  }
  const pill =
    'inline-flex h-[26px] max-w-full items-center gap-[6px] whitespace-nowrap rounded-sm px-[7px] text-sm source-hover:bg-surface-2';
  return (
    <div data-subtask-detail={subtask.id}>
      <button
        className={`${pill} -ml-[7px] -mt-1 mb-[14px] text-[12.5px] text-secondary`}
        onClick={onClose}
      >
        <Icon name="arrow-left" size={14} />
        <span className="max-w-[420px] truncate">{task.title}</span>
      </button>
      <div className="flex items-start gap-[10px]">
        <Checkbox
          round
          className="mt-[9px]"
          checked={subtask.done}
          disabled={commands.pending}
          aria-label={subtask.done ? t('Mark subtask not done') : t('Mark subtask done')}
          onCheckedChange={(done) => {
            void commands.update(subtask.id, { done });
          }}
        />
        <textarea
          ref={ref}
          className={`-mx-[6px] w-full resize-none overflow-hidden rounded-sm border-0 bg-transparent px-[6px] py-1 text-xl font-semibold leading-[1.3] tracking-[-.018em] outline-none source-hover:bg-surface-2 focus:bg-surface-2 focus:[box-shadow:0_0_0_1px_var(--border-strong)] ${subtask.done ? 'text-muted line-through' : ''}`}
          disabled={commands.pending}
          aria-label={t('Subtask title')}
          rows={1}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            onDraftChange({ title: event.target.value, note });
          }}
          onBlur={() => {
            void saveTitle();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      <div className="ml-[26px] mt-1 text-xs text-muted">
        {t('Subtask')} {index + 1}
        {'  '}
        {t('of')} {subtasks.length}
        {' · '}
        {subtask.done ? t('Done') : t('Open')}
      </div>
      <dl className="task-property-grid mt-4 grid grid-cols-[112px_minmax(0,1fr)] items-center gap-y-[2px] text-sm">
        <dt className="flex h-[30px] items-center gap-[7px] text-secondary">
          <Icon name="user" size={14} className="text-faint" />
          {t('Assignee')}
        </dt>
        <dd className="m-0">
          <AssigneeField
            value={subtask.assigneeId}
            members={data.members}
            currentMemberId={data.currentMember.id}
            disabled={commands.pending}
            open={field === 'assignee'}
            onOpenChange={(open) => setField(open ? 'assignee' : null)}
            onChange={async (assigneeId) => !!(await commands.update(subtask.id, { assigneeId }))}
            trigger={
              <MemberIdentity
                member={data.members.find((row) => row.id === subtask.assigneeId) ?? null}
                className="static!"
              />
            }
          />
        </dd>
        <dt className="flex h-[30px] items-center gap-[7px] text-secondary">
          <Icon name="calendar" size={14} className="text-faint" />
          {t('Due date')}
        </dt>
        <dd className="m-0">
          <TaskDateField
            value={subtask.dueDate}
            field="dueDate"
            today={today}
            weekStart={data.preferences.weekStart}
            disabled={commands.pending}
            open={field === 'due'}
            onOpenChange={(open) => setField(open ? 'due' : null)}
            onChange={async (dueDate) => !!(await commands.update(subtask.id, { dueDate }))}
          />
        </dd>
        <dt className="flex h-[30px] items-center gap-[7px] text-secondary">
          <Icon name="folder" size={14} className="text-faint" />
          {t('Parent')}
        </dt>
        <dd className="m-0">
          <button className={pill} onClick={onClose}>
            <span className="font-mono text-[11px] tracking-[-.01em] text-muted">{task.key}</span>
            {task.title}
          </button>
        </dd>
      </dl>
      <section className="task-detail-section">
        <div className="mb-2 flex items-center gap-2">
          <h3 id="subtask-note-label" className="m-0 text-body font-semibold">
            {t('Notes')}
          </h3>
        </div>
        <Textarea
          aria-labelledby="subtask-note-label"
          rows={4}
          placeholder={t('Add details, links, or acceptance criteria…')}
          disabled={commands.pending}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            onDraftChange({ title, note: event.target.value });
          }}
          onBlur={() => {
            if (note !== subtask.note) void commands.update(subtask.id, { note });
          }}
        />
      </section>
      <div className="task-detail-section flex flex-wrap items-center gap-[6px]">
        <Button
          size="sm"
          variant="secondary"
          disabled={commands.pending}
          onClick={() => {
            void commands.promote(subtask.id).then((result) => {
              const created = result?.data.createdTasks[0];
              if (created) {
                onClose();
                onPromoted(created);
              }
            });
          }}
        >
          <Icon name="arrow-up-right" size={13} />
          {t('Convert to task')}
        </Button>
        <span className="grow" />
        <Button
          size="sm"
          variant="ghost"
          disabled={index === 0 || commands.pending}
          aria-label={t('Previous subtask')}
          onClick={() => onOpen(subtasks[index - 1]!.id)}
        >
          <Icon name="chevron-left" size={14} />
          {t('Previous')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={index === subtasks.length - 1 || commands.pending}
          aria-label={t('Next subtask')}
          onClick={() => onOpen(subtasks[index + 1]!.id)}
        >
          {t('Next')}
          <Icon name="chevron-right" size={14} />
        </Button>
        <Button
          size="sm"
          variant="dangerGhost"
          disabled={commands.pending}
          onClick={() => {
            void commands.remove(subtask.id).then((result) => {
              if (result) onClose();
            });
          }}
        >
          <Icon name="trash-2" size={13} />
          {t('Delete')}
        </Button>
      </div>
      {(validation || commands.error) && (
        <p role="alert" className="text-xs text-red">
          {validation || commands.error}
        </p>
      )}
    </div>
  );
}
