import { useAppServices } from '../../app/services/app-services';
import { taskFieldPatch } from '../tasks/date-patch';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useEffect, useState } from 'react';
import { Alert, Button, ColorDot, Icon, IconButton } from '@studio/ui';
import type { BootstrapDto, NotificationDto, TaskDto } from '@studio/contracts/api';
import { CommentComposer, CommentList } from '../comments/Comments';
import { useTaskComments } from '../comments/queries';
import { useStudioQuery } from '../../data/queries';
import { useDataRuntime } from '../../data/context';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
import { useTaskFieldCommands } from '../tasks/useTaskFieldCommands';
import { AssigneeField, TaskDateField, TaskPriorityField, TaskStatusField } from '../tasks/fields';
import type { TaskFieldValues } from '../tasks/field-types';
import { notificationProject } from './presentation';

export interface InboxPreviewProps {
  notification: NotificationDto;
  task?: TaskDto | undefined;
  data: BootstrapDto;
  draft: string;
  onDraftChange: (value: string) => void;
  onDraftPosted: () => void;
  onClose: () => void;
  onTaskOpen: (id: string) => void;
  onProjectOpen: (id: string) => void;
}
export function InboxPreview(props: InboxPreviewProps) {
  useTranslation();
  const project = notificationProject(props);
  if (!props.task)
    return (
      <div className="px-7 py-6">
        <Button size="sm" variant="ghost" className="-ml-2 -mt-1 mb-3" onClick={props.onClose}>
          <Icon name="arrow-left" size={14} />
          {t('Back')}
        </Button>
        <Alert tone="danger">
          <Icon name="triangle-alert" size={16} className="mt-px text-red" />
          <div>
            <b>{props.notification.text}</b>
            <div className="mt-[2px] text-secondary">{props.notification.snippet}</div>
          </div>
        </Alert>
        {project && (
          <div className="mt-[14px]">
            <Button variant="secondary" onClick={() => props.onProjectOpen(project.id)}>
              {t('Open project')}
            </Button>
          </div>
        )}
      </div>
    );
  return <TaskInboxPreview {...props} task={props.task} />;
}
function TaskInboxPreview({
  notification,
  task,
  data,
  draft,
  onDraftChange,
  onDraftPosted,
  onClose,
  onTaskOpen,
}: InboxPreviewProps & { task: TaskDto }) {
  useTranslation();
  const project = notificationProject({ notification, task, data }),
    { clock } = useDataRuntime(),
    [field, setField] = useState<keyof TaskFieldValues | null>(null),
    fields = useTaskFieldCommands(task),
    commands = useTaskListCommands(task.workspaceId),
    notices = useAppServices();
  const members =
    useStudioQuery('listMembers', { workspaceId: task.workspaceId, query: { limit: 200 } }).data
      ?.data.items ?? data.members;
  const comments = useTaskComments(task.workspaceId, task.id),
    rows = comments.data?.pages.flatMap((page) => page.data.items) ?? [];
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = comments;
  useEffect(() => {
    if (hasNextPage && !isFetching && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetching, isFetchNextPageError, fetchNextPage]);
  function control<K extends keyof TaskFieldValues>(key: K) {
    return {
      value: task[key],
      onChange: (value: TaskFieldValues[K]) =>
        fields.patch(taskFieldPatch(task, key, value, 'record')),
      open: field === key,
      onOpenChange: (open: boolean) => setField(open ? key : null),
      disabled: fields.pending,
      error: fields.error,
    };
  }
  return (
    <>
      <div className="flex h-[46px] shrink-0 items-center gap-2 border-0 border-b border-solid border-border px-4">
        <IconButton size="sm" aria-label={t('Back')} onClick={onClose}>
          <Icon name="arrow-left" size={15} />
        </IconButton>
        {project && (
          <>
            <ColorDot color={project.color} className="size-2! rounded-[3px]!" />
            <span className="text-sm text-secondary">{project.name}</span>
          </>
        )}
        <span className="font-mono text-[.92em] tracking-[-.01em] text-muted">{task.key}</span>
        <span className="grow" />
        <Button size="sm" variant="secondary" onClick={() => onTaskOpen(task.id)}>
          <Icon name="panel-right-open" size={14} />
          {t('Open task')}
        </Button>
      </div>
      <div
        className="w-full max-w-[720px] px-7 py-6"
        data-inbox-conversation
        data-conversation-ready={
          !comments.isPending && !comments.hasNextPage && !comments.error ? '' : undefined
        }
      >
        <h2 className="m-0 mb-[10px] text-xl font-semibold tracking-[-.015em]">{task.title}</h2>
        <div className="mb-[18px] flex flex-wrap items-center gap-1">
          <TaskStatusField {...control('status')} />
          <AssigneeField
            {...control('assigneeId')}
            members={members}
            currentMemberId={data.currentMember.id}
          />
          <TaskPriorityField {...control('priority')} />
          <TaskDateField
            {...control('dueDate')}
            field="dueDate"
            today={clock.today()}
            weekStart={data.preferences.weekStart}
            overdue={task.status !== 'done' && !!task.dueDate && task.dueDate < clock.today()}
          />
        </div>
        {fields.error && <Alert tone="danger">{fields.error}</Alert>}
        <div className="mb-1 text-2xs font-semibold uppercase tracking-[.07em] text-muted">
          {t('Conversation')}
        </div>
        {!comments.isPending && !comments.error && !rows.length ? (
          <p className="my-[1em] text-secondary">{notification.snippet}</p>
        ) : (
          <CommentList
            comments={rows.slice(-4)}
            members={members}
            currentMemberId={data.currentMember.id}
            now={clock.now()}
            pending={commands.pending}
            loading={comments.isPending || (comments.hasNextPage && !comments.error)}
            {...(comments.error ? { error: comments.error.message } : {})}
            onRetry={() => {
              void comments.refetch();
            }}
            onDelete={async (comment) => {
              const result = await commands.run('deleteComment', {
                workspaceId: task.workspaceId,
                commentId: comment.id,
                body: { expectedVersion: comment.version },
              });
              if (result?.data.undo) notices.notice(t('Comment deleted'), result.data.undo);
            }}
            onReaction={async (comment, key, active) =>
              !!(await commands.run(active ? 'removeCommentReaction' : 'addCommentReaction', {
                workspaceId: task.workspaceId,
                commentId: comment.id,
                reactionKey: key,
              }))
            }
          />
        )}
        <CommentComposer
          presentation="inbox"
          label={t('Reply')}
          buttonLabel="Reply"
          currentMember={data.currentMember}
          members={members}
          value={draft}
          onChange={onDraftChange}
          onPosted={onDraftPosted}
          pending={commands.pending}
          {...(commands.error ? { error: commands.error } : {})}
          onFiles={() => {}}
          onPost={async (body) => {
            const result = await commands.run('createComment', {
              workspaceId: task.workspaceId,
              taskId: task.id,
              body,
            });
            if (result) notices.notice(t('Reply posted'));
            return !!result;
          }}
        />
      </div>
    </>
  );
}
