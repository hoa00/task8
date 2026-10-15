import { translate as t } from '../../../i18n/i18n';
import { useTranslation } from '../../../i18n/useTranslation';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Alert, Button, ColorDot, Dialog, Icon, IconButton } from '@studio/ui';
import type {
  BootstrapDto,
  FileDto,
  ProjectDto,
  TaskDetailDto,
  TaskDto,
} from '@studio/contracts/api';
import { dateDistance } from '@studio/domain';
import { TaskPropertyGrid } from './TaskPropertyGrid';
import { AttachmentCard, Dropzone, UploadProgress } from '../../files/FileFoundation';
import { useTaskFieldCommands } from '../useTaskFieldCommands';
import { useTaskListCommands } from '../useTaskListCommands';
import { useDataRuntime } from '../../../data/context';
import { ago } from '../date-display';
import type { TaskFieldValues } from '../field-types';
import { DescriptionEditor } from './DescriptionEditor';
import { SubtaskList, SubtaskDetail } from './Subtasks';
import { useSubtaskCommands } from './useSubtaskCommands';
import { TaskConversation } from './TaskConversation';
import type { UndoDescriptorDto } from '@studio/contracts/api';
export interface TaskDrawerDraft {
  title: string;
  titleDirty: boolean;
  scrollTop: number;
  descriptionHtml?: string;
  descriptionDirty?: boolean;
  subtaskId?: string | null;
  subtaskScrollTop?: number;
  tab?: 'comments' | 'activity';
  comment?: string;
  commentRevision?: number;
  subtaskDrafts?: Record<string, { title: string; note: string }>;
}
export interface AttachmentUpload {
  id: string;
  name: string;
  taskId: string;
  status: 'uploading' | 'failed';
  error?: string;
}
export interface TaskDrawerProps {
  project?: Pick<ProjectDto, 'id' | 'name' | 'color'>;
  onNotice: (message: string, kind?: 'info' | 'error') => void;
  onPromoted: (task: TaskDto) => void;
  sections?: ReactNode;
  detail: TaskDetailDto;
  data: BootstrapDto;
  tasks: readonly TaskDto[];
  full: boolean;
  onFullChange: (full: boolean) => void;
  openField: keyof TaskFieldValues | null;
  onOpenFieldChange: (field: keyof TaskFieldValues | null) => void;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
  onMenu: (id: string, anchor: HTMLElement) => void;
  onProjectOpen: (id: string) => void;
  onCopy: () => void;
  onUndo: (descriptor: UndoDescriptorDto, message: string) => void;
  draft: TaskDrawerDraft;
  onDraftChange: (patch: Partial<TaskDrawerDraft>, expectedCommentRevision?: number) => void;
  onUpload: (files: readonly File[]) => void;
  uploads: readonly AttachmentUpload[];
  onRetry: (id: string) => void;
  onRemove: (file: FileDto) => void;
  onPreview: (file: FileDto) => void;
}
export function TaskDrawer(props: TaskDrawerProps) {
  useTranslation();
  const {
      detail,
      data,
      full,
      onClose,
      onFullChange,
      returnFocus,
      onMenu,
      onProjectOpen,
      onCopy,
      onUndo,
    } = props,
    task = detail.task,
    project =
      props.project ?? data.projects.find((row) => row.project.id === task.projectId)!.project;
  const commands = useTaskFieldCommands(task),
    [completionPending, setCompletionPending] = useState(false);
  async function complete() {
    if (completionPending) return;
    setCompletionPending(true);
    const undo = await commands.complete();
    setCompletionPending(false);
    if (undo) onUndo(undo, t('Completed “{{name}}”', { name: task.title }));
  }
  return (
    <Dialog
      open
      mode="drawer"
      modal={full}
      returnFocus={returnFocus}
      aria-labelledby="task-drawer-heading"
      className={`task-drawer ${full ? 'task-drawer-full' : ''}`}
      onOpenChange={(next, reason) => {
        if (!next) {
          if (reason === 'escape' && props.draft.subtaskId)
            props.onDraftChange({ subtaskId: null });
          else onClose();
        }
      }}
      data-task-drawer={task.id}
      onDragOver={(event) => {
        if (!event.defaultPrevented && event.dataTransfer.types.includes('Files'))
          event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.defaultPrevented || !event.dataTransfer.files.length) return;
        event.preventDefault();
        event.stopPropagation();
        props.onUpload([...event.dataTransfer.files]);
      }}
    >
      <h2 id="task-drawer-heading" className="sr-only">
        {props.draft.subtaskId
          ? t('Subtask: {{value1}}', {
              value1: String(
                detail.subtasks.find((row) => row.id === props.draft.subtaskId)?.title ??
                  task.title,
              ),
            })
          : t('Task: {{value1}}', { value1: String(task.title) })}
      </h2>
      <div className="flex h-[46px] shrink-0 items-center gap-1 border-0 border-b border-solid border-border pl-4 pr-[10px]">
        <button
          className="inline-flex h-[26px] items-center gap-[6px] whitespace-nowrap rounded-sm px-[7px] text-[12.5px] source-hover:bg-surface-2"
          onClick={() => onProjectOpen(project.id)}
        >
          <ColorDot className="size-2! rounded-[3px]!" color={project.color} />
          {project.name}
        </button>
        <span className="text-muted">{'/'}</span>
        <span className="px-[6px] font-mono text-[11.5px] tracking-[-.01em] text-muted">
          {task.key}
        </span>
        <span className="grow" />
        <Button
          size="sm"
          variant={task.status === 'done' ? 'secondary' : 'ghost'}
          disabled={completionPending}
          className={task.status === 'done' ? 'text-green' : ''}
          onClick={() => {
            void complete();
          }}
        >
          <Icon name={task.status === 'done' ? 'circle-check' : 'circle'} size={14} />
          <span className="task-hide-mobile">
            {task.status === 'done' ? t('Completed') : t('Mark complete')}
          </span>
        </Button>
        <FavoriteButton task={task} />
        <IconButton size="sm" aria-label={t('Copy link')} onClick={onCopy}>
          <Icon name="link" size={15} />
        </IconButton>
        <IconButton
          size="sm"
          className="task-hide-mobile"
          aria-label={t('Toggle full page')}
          onClick={() => onFullChange(!full)}
        >
          <Icon name={full ? 'minimize-2' : 'maximize-2'} size={15} />
        </IconButton>
        <IconButton
          size="sm"
          aria-label={t('More')}
          onClick={(event) => onMenu(task.id, event.currentTarget)}
        >
          <Icon name="ellipsis" size={15} />
        </IconButton>
        <IconButton size="sm" aria-label={t('Close')} onClick={onClose}>
          <Icon name="x" size={16} />
        </IconButton>
      </div>
      <TaskDetailsBody {...props} commands={commands} onComplete={complete} />
    </Dialog>
  );
}
function FavoriteButton({ task }: { task: TaskDto }) {
  useTranslation();
  const commands = useTaskListCommands(task.workspaceId);
  return (
    <>
      <IconButton
        size="sm"
        aria-label={t('Favorite')}
        aria-pressed={task.isFavorite}
        disabled={commands.pending}
        className={
          task.isFavorite ? 'text-amber! aria-pressed:bg-transparent! aria-pressed:text-amber!' : ''
        }
        onClick={() => {
          void commands.run(task.isFavorite ? 'removeTaskFavorite' : 'addTaskFavorite', {
            workspaceId: task.workspaceId,
            taskId: task.id,
          });
        }}
      >
        <Icon name="star" size={15} />
      </IconButton>
      {commands.error && (
        <span role="alert" className="text-xs text-red">
          {commands.error}
        </span>
      )}
    </>
  );
}
export interface TaskDetailsBodyProps extends TaskDrawerProps {
  commands: ReturnType<typeof useTaskFieldCommands>;
  onComplete: () => Promise<void>;
}
export function TaskDetailsBody({
  detail,
  data,
  tasks,
  full,
  draft,
  commands,
  onComplete,
  onUpload,
  uploads,
  onRetry,
  onRemove,
  onPreview,
  onDraftChange,
  openField,
  onOpenFieldChange,
  sections,
  onUndo,
  onPromoted,
  onNotice,
}: TaskDetailsBodyProps) {
  useTranslation();
  const task = detail.task,
    { clock } = useDataRuntime(),
    textCommands = useTaskListCommands(task.workspaceId),
    body = useRef<HTMLDivElement>(null),
    titleRef = useRef<HTMLTextAreaElement>(null),
    saving = useRef(false);
  const subCommands = useSubtaskCommands(task),
    subtask = detail.subtasks.find((row) => row.id === draft.subtaskId);
  const [bodyEntered, setBodyEntered] = useState(false);
  const [title, setTitle] = useState(draft.titleDirty ? draft.title : task.title);
  useLayoutEffect(() => {
    if (body.current)
      body.current.scrollTop = subtask ? (draft.subtaskScrollTop ?? 0) : draft.scrollTop;
  }, [draft, subtask]);
  useLayoutEffect(() => {
    const element = titleRef.current;
    if (element) {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    }
  }, [title, task.title]);
  async function commitTitle() {
    if (saving.current || !draft.titleDirty) return;
    if (!title.trim()) return;
    saving.current = true;
    const result = await textCommands.run('updateTask', {
      workspaceId: task.workspaceId,
      taskId: task.id,
      body: { expectedVersion: task.version, title },
    });
    saving.current = false;
    if (result) {
      onDraftChange({ title: result.data.task.title, titleDirty: false });
    }
  }
  const overdue = task.status !== 'done' && !!task.dueDate && task.dueDate < clock.today();
  async function commitDescription(html: string) {
    if (saving.current) return false;
    saving.current = true;
    const result = await textCommands.run('updateTask', {
      workspaceId: task.workspaceId,
      taskId: task.id,
      body: { expectedVersion: task.version, descriptionHtml: html },
    });
    saving.current = false;
    if (result)
      onDraftChange({ descriptionHtml: result.data.task.descriptionHtml, descriptionDirty: false });
    return !!result;
  }
  return (
    <div
      ref={body}
      data-body-entered={bodyEntered ? '' : undefined}
      onAnimationEnd={(event) => {
        if (
          event.target instanceof Element &&
          event.target.parentElement === event.currentTarget &&
          !event.currentTarget
            .getAnimations({ subtree: true })
            .some(
              (animation) =>
                animation.effect instanceof KeyframeEffect &&
                animation.effect.target?.parentElement === event.currentTarget &&
                animation.playState !== 'finished',
            )
        )
          setBodyEntered(true);
      }}
      className="task-drawer-body flex-1 overflow-y-auto px-6 pb-8 pt-5"
      onScroll={(event) => {
        onDraftChange(
          subtask
            ? { subtaskScrollTop: event.currentTarget.scrollTop }
            : { scrollTop: event.currentTarget.scrollTop },
        );
      }}
    >
      {subtask ? (
        <SubtaskDetail
          {...(draft.subtaskDrafts?.[subtask.id]
            ? { draft: draft.subtaskDrafts[subtask.id]! }
            : {})}
          onDraftChange={(childDraft) =>
            onDraftChange({ subtaskDrafts: { ...draft.subtaskDrafts, [subtask.id]: childDraft } })
          }
          key={subtask.id}
          task={task}
          subtask={subtask}
          subtasks={detail.subtasks}
          data={data}
          commands={subCommands}
          onClose={() => onDraftChange({ subtaskId: null })}
          onOpen={(id) => onDraftChange({ subtaskId: id, subtaskScrollTop: 0 })}
          onPromoted={onPromoted}
        />
      ) : (
        <>
          {task.status === 'done' ? (
            <Alert tone="ok" className="mb-3">
              <span>
                {t('Completed')} {task.completedAt ? ago(task.completedAt, clock.now()) : ''}
                {'. '}
                <button
                  className="text-accent source-hover:underline"
                  onClick={() => {
                    void onComplete();
                  }}
                >
                  {t('Reopen task')}
                </button>
              </span>
            </Alert>
          ) : overdue ? (
            <Alert tone="danger" className="mb-3" icon="clock-alert">
              <span>
                {t('Overdue by')} {-dateDistance(task.dueDate!, clock.today())}
                {'  '}
                {t('day')}
                {-dateDistance(task.dueDate!, clock.today()) > 1 ? t('s') : ''}
                {'. '}
                <button
                  className="text-accent source-hover:underline"
                  onClick={() => onOpenFieldChange('dueDate')}
                >
                  {t('Reschedule')}
                </button>
              </span>
            </Alert>
          ) : null}
          <textarea
            ref={titleRef}
            value={draft.titleDirty ? title : task.title}
            aria-label={t('Task title')}
            rows={1}
            className="-mx-[6px] my-0 w-full resize-none overflow-hidden rounded-sm border-0 bg-transparent px-[6px] py-1 text-xl font-semibold leading-[1.3] tracking-[-.018em] outline-none source-hover:bg-surface-2 focus:bg-surface-2 focus:[box-shadow:0_0_0_1px_var(--border-strong)]"
            onChange={(event) => {
              setTitle(event.target.value);
              onDraftChange({ title: event.target.value, titleDirty: true });
            }}
            onBlur={() => {
              void commitTitle();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <TaskPropertyGrid
            value={{ ...task, ...commands.attempt }}
            data={data}
            tasks={tasks}
            onPatch={commands.patch}
            openField={openField}
            onOpenFieldChange={onOpenFieldChange}
            full={full}
            taskId={task.id}
            disabled={commands.pending}
            error={commands.error}
          />
          {(commands.error || textCommands.error) && (
            <p className="text-xs text-red" role="alert">
              {commands.error || textCommands.error}
            </p>
          )}
          {sections !== undefined ? (
            sections
          ) : (
            <>
              <DescriptionEditor
                onNotice={onNotice}
                value={
                  draft.descriptionDirty
                    ? (draft.descriptionHtml ?? task.descriptionHtml)
                    : task.descriptionHtml
                }
                dirty={!!draft.descriptionDirty}
                onChange={(descriptionHtml) =>
                  onDraftChange({ descriptionHtml, descriptionDirty: true })
                }
                onCommit={commitDescription}
              />
              <SubtaskList
                task={task}
                subtasks={detail.subtasks}
                data={data}
                commands={subCommands}
                onOpen={(id) => onDraftChange({ subtaskId: id, subtaskScrollTop: 0 })}
              />
              <section className="mt-[26px]" data-task-attachments>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="m-0 text-body font-semibold">{t('Attachments')}</h3>
                  <span className="text-xs text-muted">{detail.attachments.length}</span>
                  <label className="ml-auto inline-flex h-control-sm cursor-pointer items-center gap-[6px] rounded-sm border border-solid border-transparent px-2 text-xs font-medium text-secondary source-hover:bg-surface-2 [&_svg]:opacity-90">
                    <Icon name="upload" size={13} />
                    {t('Upload')}
                    <input
                      type="file"
                      multiple
                      hidden
                      aria-label={t('Upload attachments')}
                      onChange={(event) => {
                        onUpload([...(event.target.files ?? [])]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>
                {uploads.map((upload) =>
                  upload.status === 'uploading' ? (
                    <UploadProgress key={upload.id} name={upload.name} percent={null} />
                  ) : (
                    <div key={upload.id} role="alert" className="mb-2 text-xs text-red">
                      {upload.name}
                      {': '}
                      {upload.error}
                      <Button size="xs" onClick={() => onRetry(upload.id)}>
                        {t('Retry')}
                      </Button>
                    </div>
                  ),
                )}
                {detail.attachments.length ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                    {detail.attachments.map((file) => (
                      <AttachmentCard
                        key={file.id}
                        file={file}
                        onPreview={onPreview}
                        onRemove={onRemove}
                      />
                    ))}
                  </div>
                ) : !uploads.length ? (
                  <Dropzone onFiles={onUpload} />
                ) : null}
              </section>
              <TaskConversation
                onNotice={onNotice}
                task={task}
                data={data}
                tab={draft.tab ?? 'comments'}
                onTabChange={(tab) => onDraftChange({ tab })}
                draft={draft.comment ?? ''}
                onDraftChange={(comment) => onDraftChange({ comment })}
                onPosted={() => onDraftChange({ comment: '' }, draft.commentRevision ?? 0)}
                onUpload={onUpload}
                onUndo={onUndo}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
