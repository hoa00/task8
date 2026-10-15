import { translateErrorMessage } from '../../../i18n/error-message';
import { captureIntent } from '../../../data/operations';
import { translate as t } from '../../../i18n/i18n';
import { useTranslation } from '../../../i18n/useTranslation';
import { useContext, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  ContextMenu,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Icon,
  MenuItem,
  MenuSeparator,
  ToastViewport,
} from '@studio/ui';
import type { OverlayPoint, ToastMessage } from '@studio/ui';
import type { BootstrapDto, FileDto, TaskDto, UndoDescriptorDto } from '@studio/contracts/api';
import { normalizeTaskView } from '../task-view.ts';
import { links } from '../../../app/navigation';
import { useDataRuntime } from '../../../data/context';
import { studioQueryOptions, useStudioQuery } from '../../../data/queries';
import { StudioApiError } from '../../../data/errors';
import { invalidateOperation } from '../../../data/invalidation';
import { TaskDrawer } from './TaskDrawer';
import { useTaskCommentDraftStore } from '../../comments/draft-context';
import type { AttachmentUpload, TaskDrawerDraft } from './TaskDrawer';
import { TaskFormDialog } from './TaskFormDialog';
import { FileIntentContext } from '../../files/file-intents';
import { FilePreviewDialog } from '../../files/FilePreviewDialog';
import { useTaskListDataset } from '../useTaskListDataset';
import { useTaskListCommands } from '../useTaskListCommands';
import type { TaskFieldValues, TaskFormDefaults } from '../field-types';
export interface TaskMenuIntent {
  taskId: string;
  anchor: HTMLElement;
  point?: OverlayPoint;
}
export interface TaskFormIntent {
  open: boolean;
  taskId?: string;
  generation: number;
  defaults?: TaskFormDefaults;
}
export interface TaskOverlayHostProps {
  drawerSections?: ReactNode;
  data: BootstrapDto;
  taskId?: string;
  onTaskOpen: (id: string) => void;
  onTaskClose: () => void;
  opener: RefObject<HTMLElement | null>;
  form: TaskFormIntent;
  onFormChange: (value: TaskFormIntent) => void;
  menu: TaskMenuIntent | null;
  onMenuChange: (value: TaskMenuIntent | null) => void;
  onProjectOpen: (id: string) => void;
}
interface UploadJob extends AttachmentUpload {
  projectId: TaskDto['projectId'];
  file: File;
}
// A deleted or restricted parent can disappear before its child refetch completes.
// Keep transient cached reads, but never render a child after a terminal denial.
function availableChild<T>(value: T | undefined, error: unknown): T | undefined {
  return error instanceof StudioApiError && (error.status === 403 || error.status === 404)
    ? undefined
    : value;
}
export function TaskOverlayHost({
  data,
  taskId,
  onTaskOpen,
  onTaskClose,
  opener,
  form,
  onFormChange,
  menu,
  onMenuChange,
  onProjectOpen,
  drawerSections,
}: TaskOverlayHostProps) {
  useTranslation();
  const files = useContext(FileIntentContext),
    workspaceId = data.workspace.id,
    { client } = useDataRuntime(),
    cache = useQueryClient(),
    commands = useTaskListCommands(workspaceId);
  const [view, setView] = useState<{ taskId: string | undefined; full: boolean }>({
      taskId,
      full: data.preferences.openTasks === 'full',
    }),
    [openField, setOpenField] = useState<keyof TaskFieldValues | null>(null),
    [previewId, setPreviewId] = useState<string | null>(null),
    [toasts, setToasts] = useState<ToastMessage[]>([]),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [jobs, setJobs] = useState<readonly UploadJob[]>([]);
  if (view.taskId !== taskId) setView({ taskId, full: data.preferences.openTasks === 'full' });
  const full = view.taskId === taskId ? view.full : data.preferences.openTasks === 'full';
  const setFull = (full: boolean) => setView({ taskId, full });
  const drafts = useRef(new Map<string, TaskDrawerDraft>()),
    activeJobs = useRef(new Set<string>());
  const dataset = useTaskListDataset(
    workspaceId,
    normalizeTaskView({ query: { limit: 200 } }).query,
    form.open || openField === 'dependencyIds',
  );
  const tasks = dataset.data ?? [];
  function toast(
    message: string,
    action?: ToastMessage['action'],
    kind: ToastMessage['kind'] = 'success',
  ) {
    setToasts((current) => [
      { id: crypto.randomUUID(), message, kind, ...(action ? { action, duration: 0 } : {}) },
      ...current,
    ]);
  }
  function undo(descriptor: UndoDescriptorDto, message: string) {
    toast(message, {
      label: t('Undo'),
      onAction: () => {
        void commands.undo(descriptor);
      },
    });
  }
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('Link copied'));
    } catch {
      toast(t('Link could not be copied'));
    }
  }
  async function deleteTask(id: string) {
    const intentClient = captureIntent(client);
    const latest = await commands.run('getTask', { workspaceId, taskId: id }, intentClient);
    if (!latest) return;
    const result = await commands.run(
      'deleteTask',
      { workspaceId, taskId: id, body: { expectedVersion: latest.data.task.version } },
      intentClient,
    );
    if (result?.data.undo) {
      if (taskId === id) closeTask();
      undo(result.data.undo, t('Task deleted'));
    }
  }
  function closeTask() {
    setOpenField(null);
    onTaskClose();
  }
  async function removeFile(file: FileDto) {
    const result = await commands.run('deleteFile', {
      workspaceId,
      fileId: file.id,
      body: { expectedVersion: file.version },
    });
    if (result?.data.undo) {
      if (files) files.deleted(file, result.data.undo);
      else undo(result.data.undo, t('Deleted “{{name}}”', { name: file.name }));
    }
  }
  async function upload(job: UploadJob) {
    if (activeJobs.current.has(job.id)) return;
    activeJobs.current.add(job.id);
    setJobs((current) =>
      current.map((row) => (row.id === job.id ? { ...row, status: 'uploading', error: '' } : row)),
    );
    const intentClient = captureIntent(client);
    try {
      await intentClient.api.uploadProjectFile({
        workspaceId,
        projectId: job.projectId,
        body: {
          taskId: job.taskId,
          clientRequestId: job.id,
          file: {
            name: job.file.name,
            mimeType: job.file.type || 'application/octet-stream',
            bytes: new Uint8Array(await job.file.arrayBuffer()),
          },
        },
      });
      setJobs((current) => current.filter((row) => row.id !== job.id));
    } catch (cause) {
      setJobs((current) =>
        current.map((row) =>
          row.id === job.id
            ? {
                ...row,
                status: 'failed',
                error:
                  cause instanceof Error
                    ? translateErrorMessage(cause.message)
                    : t('Attachment upload failed'),
              }
            : row,
        ),
      );
    } finally {
      activeJobs.current.delete(job.id);
      await invalidateOperation(cache, 'uploadProjectFile', {
        workspaceId,
        projectId: job.projectId,
        body: {
          taskId: job.taskId,
          clientRequestId: job.id,
          file: {
            name: job.file.name,
            mimeType: job.file.type || 'application/octet-stream',
            bytes: new Uint8Array(),
          },
        },
      });
    }
  }
  function selectFiles(task: TaskDto, files: readonly File[]) {
    if (files.some((file) => file.size > 10485760)) {
      toast(t('Files must be 10 MiB or smaller'));
      return;
    }
    const next: UploadJob[] = files.map((file) => ({
      id: crypto.randomUUID(),
      taskId: task.id,
      projectId: task.projectId,
      name: file.name,
      file,
      status: 'uploading',
    }));
    setJobs((current) => [...current, ...next]);
    next.forEach((job) => {
      void upload(job);
    });
  }
  function saved(id: string, key: string, more: boolean) {
    toast(
      form.taskId ? t('Changes saved') : t('Created {{name}}', { name: key }),
      more ? undefined : { label: t('Open'), onAction: () => onTaskOpen(id) },
    );
  }
  return (
    <>
      {taskId && (
        <DrawerController
          sections={drawerSections}
          key={taskId}
          taskId={taskId}
          workspaceId={workspaceId}
          data={data}
          tasks={tasks}
          full={full}
          setFull={setFull}
          openField={openField}
          setOpenField={setOpenField}
          onClose={closeTask}
          opener={opener}
          onMenu={(id, anchor) => onMenuChange({ taskId: id, anchor })}
          onProjectOpen={onProjectOpen}
          onCopy={() => {
            void copy(new URL(links.task(workspaceId, taskId), location.origin).href);
          }}
          onUndo={undo}
          onNotice={(message, kind) => toast(message, undefined, kind ?? 'info')}
          onPromoted={(task) =>
            toast(t('Converted to {{key}}', { key: task.key }), {
              label: t('Open'),
              onAction: () => onTaskOpen(task.id),
            })
          }
          drafts={drafts.current}
          jobs={jobs}
          selectFiles={selectFiles}
          onRetry={(id) => {
            const job = jobs.find((row) => row.id === id);
            if (job) void upload(job);
          }}
          onRemove={(file) => {
            void removeFile(file);
          }}
          onPreview={(file) => (files ? files.openFile(file) : setPreviewId(file.id))}
        />
      )}
      {!!data.projects.some((row) => row.access === 'allowed') && (
        <TaskFormDialog
          open={form.open && !form.taskId}
          {...(form.defaults ? { defaults: form.defaults } : {})}
          onClose={() => onFormChange({ ...form, open: false })}
          data={data}
          tasks={tasks}
          onSuccess={saved}
        />
      )}
      {form.taskId && (
        <EditFormController
          key={`${form.taskId}:${form.generation}`}
          taskId={form.taskId}
          data={data}
          tasks={tasks}
          open={form.open}
          onClose={() => onFormChange({ ...form, open: false })}
          onSuccess={saved}
        />
      )}
      {menu && (
        <TaskContextController
          intent={menu}
          workspaceId={workspaceId}
          onClose={() => onMenuChange(null)}
          onOpen={(id) => {
            onMenuChange(null);
            onTaskOpen(id);
          }}
          onEdit={(id) => {
            onMenuChange(null);
            onFormChange({ open: true, taskId: id, generation: form.generation + 1 });
          }}
          onField={(id, field) => {
            onMenuChange(null);
            setOpenField(field);
            onTaskOpen(id);
          }}
          onDelete={(id) => {
            onMenuChange(null);
            if (data.preferences.confirmDel) setDeleteId(id);
            else void deleteTask(id);
          }}
          onCopy={(id) => {
            onMenuChange(null);
            void copy(new URL(links.task(workspaceId, id), location.origin).href);
          }}
          onUndo={undo}
          onArchived={(id) => {
            onMenuChange(null);
            if (taskId === id) closeTask();
          }}
          onDuplicated={(id) => {
            onMenuChange(null);
            toast(t('Task duplicated'), { label: t('Open'), onAction: () => onTaskOpen(id) });
          }}
        />
      )}
      {deleteId && (
        <DeleteController
          taskId={deleteId}
          workspaceId={workspaceId}
          onClose={() => setDeleteId(null)}
          onDeleted={(descriptor) => {
            setDeleteId(null);
            if (taskId === deleteId) closeTask();
            undo(descriptor, t('Task deleted'));
          }}
        />
      )}
      {previewId && (
        <PreviewController
          fileId={previewId}
          data={data}
          tasks={tasks}
          onClose={() => setPreviewId(null)}
          onTaskOpen={onTaskOpen}
          onCopy={(url) => {
            void copy(url);
          }}
        />
      )}
      {commands.error && (
        <Alert className="fixed bottom-4 left-4 z-[100]" tone="danger">
          {commands.error}
        </Alert>
      )}
      <ToastViewport
        items={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((row) => row.id !== id))}
      />
    </>
  );
}
interface DrawerControllerProps {
  onNotice: (message: string, kind?: 'info' | 'error') => void;
  onPromoted: (task: TaskDto) => void;
  sections?: ReactNode;
  taskId: string;
  workspaceId: string;
  data: BootstrapDto;
  tasks: readonly TaskDto[];
  full: boolean;
  setFull: (full: boolean) => void;
  openField: keyof TaskFieldValues | null;
  setOpenField: (field: keyof TaskFieldValues | null) => void;
  onClose: () => void;
  opener: RefObject<HTMLElement | null>;
  onMenu: (id: string, anchor: HTMLElement) => void;
  onProjectOpen: (id: string) => void;
  onCopy: () => void;
  onUndo: (descriptor: UndoDescriptorDto, message: string) => void;
  drafts: Map<string, TaskDrawerDraft>;
  jobs: readonly UploadJob[];
  selectFiles: (task: TaskDto, files: readonly File[]) => void;
  onRetry: (id: string) => void;
  onRemove: (file: FileDto) => void;
  onPreview: (file: FileDto) => void;
}
function DrawerController(props: DrawerControllerProps) {
  useTranslation();
  const commentDrafts = useTaskCommentDraftStore();
  const [draft, setDraft] = useState<TaskDrawerDraft>(
    () => props.drafts.get(props.taskId) ?? { title: '', titleDirty: false, scrollTop: 0 },
  );
  const query = useStudioQuery('getTask', { workspaceId: props.workspaceId, taskId: props.taskId }),
    detail = availableChild(query.data, query.error),
    { client } = useDataRuntime(),
    navigationParent = props.data.projects.find(
      (item) => item.access === 'allowed' && item.project.id === detail?.data.task.projectId,
    )?.project,
    parentQuery = useQuery({
      ...studioQueryOptions(client, 'getProject', {
        workspaceId: props.workspaceId,
        projectId: detail?.data.task.projectId ?? props.taskId,
      }),
      enabled: !!detail && !navigationParent,
    }),
    parent = navigationParent ?? availableChild(parentQuery.data, parentQuery.error)?.data;
  if (!detail || !parent)
    return (
      <Dialog
        open
        mode="drawer"
        onOpenChange={(next) => {
          if (!next) props.onClose();
        }}
        aria-label={t('Task')}
      >
        <div className="p-6">
          {query.error || parentQuery.error ? (
            <Alert tone="danger">
              {translateErrorMessage(query.error?.message) ??
                translateErrorMessage(parentQuery.error?.message)}
            </Alert>
          ) : detail ? (
            t('Loading project…')
          ) : (
            t('Loading task…')
          )}
          <Button onClick={props.onClose}>{t('Close')}</Button>
        </div>
      </Dialog>
    );
  return (
    <TaskDrawer
      project={parent}
      sections={props.sections}
      detail={detail.data}
      data={props.data}
      tasks={props.tasks}
      full={props.full}
      onFullChange={props.setFull}
      openField={props.openField}
      onOpenFieldChange={props.setOpenField}
      onClose={props.onClose}
      returnFocus={props.opener}
      onMenu={props.onMenu}
      onProjectOpen={props.onProjectOpen}
      onCopy={props.onCopy}
      onUndo={props.onUndo}
      onNotice={props.onNotice}
      onPromoted={props.onPromoted}
      draft={
        commentDrafts
          ? {
              ...draft,
              comment: commentDrafts.drafts[props.taskId]?.value ?? '',
              commentRevision: commentDrafts.drafts[props.taskId]?.revision ?? 0,
            }
          : draft
      }
      onDraftChange={(patch, expectedCommentRevision) => {
        if (commentDrafts && patch.comment !== undefined) {
          commentDrafts.changeDraft(props.taskId, patch.comment, expectedCommentRevision);
          const ownPatch = { ...patch };
          delete ownPatch.comment;
          delete ownPatch.commentRevision;
          if (!Object.keys(ownPatch).length) return;
          patch = ownPatch;
          expectedCommentRevision = undefined;
        }
        const current = props.drafts.get(props.taskId) ?? draft;
        if (
          expectedCommentRevision !== undefined &&
          (current.commentRevision ?? 0) !== expectedCommentRevision
        )
          return;
        const next = {
          ...current,
          ...patch,
          ...(patch.comment !== undefined
            ? { commentRevision: (current.commentRevision ?? 0) + 1 }
            : {}),
        };
        props.drafts.set(props.taskId, next);
        setDraft(next);
      }}
      onUpload={(files) => props.selectFiles(detail.data.task, files)}
      uploads={props.jobs.filter((row) => row.taskId === props.taskId)}
      onRetry={props.onRetry}
      onRemove={props.onRemove}
      onPreview={props.onPreview}
    />
  );
}
interface EditFormControllerProps extends Omit<Parameters<typeof TaskFormDialog>[0], 'detail'> {
  taskId: string;
}
function EditFormController({ taskId, ...props }: EditFormControllerProps) {
  useTranslation();
  const query = useStudioQuery('getTask', { workspaceId: props.data.workspace.id, taskId }),
    detail = availableChild(query.data, query.error);
  return detail ? (
    <TaskFormDialog {...props} detail={detail.data} />
  ) : props.open ? (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) props.onClose();
      }}
      aria-label={t('Edit task')}
    >
      <DialogBody>{query.error?.message ?? t('Loading task…')}</DialogBody>
    </Dialog>
  ) : null;
}
interface TaskContextControllerProps {
  intent: TaskMenuIntent;
  workspaceId: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onField: (id: string, field: keyof TaskFieldValues) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  onUndo: (descriptor: UndoDescriptorDto, message: string) => void;
  onArchived: (id: string) => void;
  onDuplicated: (id: string) => void;
}
function TaskContextController(props: TaskContextControllerProps) {
  useTranslation();
  const query = useStudioQuery('getTask', {
      workspaceId: props.workspaceId,
      taskId: props.intent.taskId,
    }),
    commands = useTaskListCommands(props.workspaceId),
    anchor = useRef<HTMLElement | null>(props.intent.anchor);
  const detail = availableChild(query.data, query.error),
    task = detail?.data.task;
  const item = (
    icon: Parameters<typeof Icon>[0]['name'],
    label: string,
    action: () => void,
    danger = false,
    shortcut?: string,
  ) => (
    <MenuItem
      aria-label={t(label)}
      icon={<Icon name={icon} size={15} />}
      disabled={commands.pending}
      onSelect={action}
      danger={danger}
      shortcut={shortcut}
    >
      {t(label)}
    </MenuItem>
  );
  const complete = async () => {
    if (!task) return;
    const result = await commands.run('setTaskCompletion', {
      workspaceId: props.workspaceId,
      taskId: task.id,
      body: { expectedVersion: task.version, completed: task.status !== 'done' },
    });
    if (result) {
      props.onClose();
      if (result.data.undo)
        props.onUndo(result.data.undo, t('Completed “{{name}}”', { name: task.title }));
    }
  };
  return (
    <ContextMenu
      label={t('Task actions')}
      open
      anchor={anchor}
      point={
        props.intent.point ?? {
          x: props.intent.anchor.getBoundingClientRect().left,
          y: props.intent.anchor.getBoundingClientRect().bottom + 4,
        }
      }
      onOpenChange={(next) => {
        if (!next) props.onClose();
      }}
    >
      {task ? (
        <>
          {item('panel-right-open', 'Open', () => props.onOpen(task.id))}
          {item('pencil', 'Edit', () => props.onEdit(task.id), false, 'E')}
          {item(
            task.status === 'done' ? 'rotate-ccw' : 'circle-check',
            task.status === 'done' ? 'Reopen' : 'Mark complete',
            () => {
              void complete();
            },
          )}
          <MenuSeparator />
          {item('circle-dot', 'Status…', () => props.onField(task.id, 'status'))}
          {item('user', 'Assign to…', () => props.onField(task.id, 'assigneeId'))}
          {item('signal-high', 'Priority…', () => props.onField(task.id, 'priority'))}
          {item('folder-input', 'Move to project…', () => props.onField(task.id, 'projectId'))}
          <MenuSeparator />
          {item('star', task.isFavorite ? 'Remove from favorites' : 'Add to favorites', () => {
            void commands
              .run(task.isFavorite ? 'removeTaskFavorite' : 'addTaskFavorite', {
                workspaceId: props.workspaceId,
                taskId: task.id,
              })
              .then((result) => {
                if (result) props.onClose();
              });
          })}
          {item('link', 'Copy link', () => props.onCopy(task.id))}
          {item('copy', 'Duplicate', () => {
            void commands
              .run('duplicateTask', {
                workspaceId: props.workspaceId,
                taskId: task.id,
                body: { expectedVersion: task.version },
              })
              .then((result) => {
                if (result) props.onDuplicated(result.data.task.id);
              });
          })}
          {item('archive', 'Archive', () => {
            void commands
              .run('archiveTask', {
                workspaceId: props.workspaceId,
                taskId: task.id,
                body: { expectedVersion: task.version },
              })
              .then((result) => {
                if (result) {
                  props.onArchived(task.id);
                  if (result.data.undo)
                    props.onUndo(
                      result.data.undo,
                      t('Archived “{{value1}}”', { value1: String(task.title) }),
                    );
                }
              });
          })}
          <MenuSeparator />
          {item('trash-2', 'Delete', () => props.onDelete(task.id), true, 'Del')}
        </>
      ) : (
        <div className="p-2">{query.error?.message ?? t('Loading task…')}</div>
      )}
      {commands.error && (
        <div className="p-2 text-xs text-red" role="alert">
          {commands.error}
        </div>
      )}
    </ContextMenu>
  );
}
export interface DeleteControllerProps {
  taskId: string;
  workspaceId: string;
  onClose: () => void;
  onDeleted: (descriptor: UndoDescriptorDto) => void;
}
export function DeleteController({
  taskId,
  workspaceId,
  onClose,
  onDeleted,
}: DeleteControllerProps) {
  useTranslation();
  const query = useStudioQuery('getTask', { workspaceId, taskId }),
    commands = useTaskListCommands(workspaceId),
    detail = availableChild(query.data, query.error);
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      aria-labelledby="single-delete-heading"
    >
      <DialogHeader titleId="single-delete-heading" title={t('Delete task?')} onClose={onClose} />
      <DialogBody>
        {detail
          ? t('“{{value1}}”, its subtasks, and comments will be deleted.', {
              value1: String(detail.data.task.title),
            })
          : (query.error?.message ?? t('Loading task…'))}
        {commands.error && <Alert tone="danger">{commands.error}</Alert>}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button
          variant="danger"
          disabled={!detail || commands.pending}
          onClick={() => {
            if (detail)
              void commands
                .run('deleteTask', {
                  workspaceId,
                  taskId,
                  body: { expectedVersion: detail.data.task.version },
                })
                .then((result) => {
                  if (result?.data.undo) onDeleted(result.data.undo);
                });
          }}
        >
          {t('Delete task')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
interface PreviewControllerProps {
  fileId: string;
  data: BootstrapDto;
  tasks: readonly TaskDto[];
  onClose: () => void;
  onTaskOpen: (taskId: string) => void;
  onCopy: (url: string) => void;
}
function PreviewController({
  fileId,
  data,
  tasks,
  onClose,
  onTaskOpen,
  onCopy,
}: PreviewControllerProps) {
  useTranslation();
  const query = useStudioQuery('getFile', { workspaceId: data.workspace.id, fileId }),
    { clock } = useDataRuntime(),
    file = availableChild(query.data, query.error)?.data;
  return file ? (
    <FilePreviewDialog
      file={file}
      author={data.members.find((member) => member.id === file.createdBy)?.name ?? 'you'}
      taskTitle={tasks.find((task) => task.id === file.taskId)?.title ?? 'Open task'}
      now={clock.now()}
      onClose={onClose}
      onTaskOpen={onTaskOpen}
      onCopy={onCopy}
    />
  ) : (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      aria-label={t('File preview')}
    >
      <DialogBody>
        {query.error?.message ?? t('Loading file…')}
        <Button onClick={onClose}>{t('Close')}</Button>
      </DialogBody>
    </Dialog>
  );
}
