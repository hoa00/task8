import {
  VersionInputSchema,
  CreateCommentInputSchema,
  CommentSchema,
  ReactionKeySchema,
  CursorQuerySchema,
} from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { fail, newMockId } from './primitives.ts';
import { cursorPage } from './cursor-page.ts';
import {
  getTask,
  editable,
  projectTask,
  addActivity,
  touchComments,
  commentOf,
} from './task-aggregate.ts';

export async function executeComments(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
): Promise<unknown> {
  const taskId = typeof input.taskId === 'string' ? input.taskId : '';
  switch (id) {
    case 'listComments': {
      const task = getTask(data, taskId),
        query = CursorQuerySchema.parse(input.query);
      const rows = Object.values(data.comments)
        .filter((row) => row.taskId === task.id && !data.taskCommands.deletedComments[row.id])
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      return {
        data: await cursorPage(
          rows,
          query,
          { operation: id, workspaceId: data.workspaceId, actorId: data.currentMemberId, taskId },
          false,
        ),
      };
    }
    case 'createComment': {
      const body = CreateCommentInputSchema.parse(input.body),
        task = getTask(data, taskId);
      editable(data, task.id, task.version);
      for (const memberId of body.mentionedMemberIds)
        if (!data.members[memberId] || data.members[memberId]!.workspaceId !== data.workspaceId)
          return fail(
            'VALIDATION_ERROR',
            'Mentioned member is not in this workspace',
            'mentionedMemberIds',
          );
      const comment = CommentSchema.parse({
        ...body,
        id: newMockId(clock),
        workspaceId: data.workspaceId,
        taskId: task.id,
        authorId: data.currentMemberId,
        createdAt: clock.now(),
        version: 1,
        reactions: [],
      });
      data.comments[comment.id] = comment;
      touchComments(data, task, clock);
      addActivity(data, task, 'comment.created', clock);
      return { data: { comment, task: projectTask(data.tasks[task.id]!, data), undo: null } };
    }
    case 'deleteComment':
    case 'restoreDeletedComment': {
      const body = VersionInputSchema.parse(input.body),
        comment = commentOf(data, String(input.commentId), id === 'restoreDeletedComment');
      if (comment.authorId !== data.currentMemberId) return fail('NOT_FOUND', 'Comment not found');
      if (comment.version !== body.expectedVersion)
        return fail('CONFLICT', 'The comment changed. Refresh and try again.');
      const task = getTask(data, comment.taskId);
      editable(data, task.id, task.version);
      const next = { ...comment, version: comment.version + 1 };
      data.comments[comment.id] = next;
      if (id === 'restoreDeletedComment') {
        if (!data.taskCommands.deletedComments[comment.id])
          return fail('CONFLICT', 'The comment is already active');
        delete data.taskCommands.deletedComments[comment.id];
        touchComments(data, task, clock);
        return {
          data: { comment: next, task: projectTask(data.tasks[task.id]!, data), undo: null },
        };
      }
      const deletedAt = clock.now();
      data.taskCommands.deletedComments[comment.id] = deletedAt;
      touchComments(data, task, clock);
      const undoId = newMockId(clock);
      data.taskCommands.commentUndoRecords[undoId] = {
        actorId: data.currentMemberId,
        commentId: comment.id,
        taskId: task.id,
        commentPostVersion: next.version,
        taskPostVersion: data.tasks[task.id]!.version,
        deletedAt,
        result: null,
      };
      return {
        data: {
          comment: next,
          task: projectTask(data.tasks[task.id]!, data),
          undo: { id: undoId, kind: 'comment.delete' },
        },
      };
    }
    case 'addCommentReaction':
    case 'removeCommentReaction': {
      const comment = commentOf(data, String(input.commentId)),
        task = getTask(data, comment.taskId);
      editable(data, task.id, task.version);
      const key = ReactionKeySchema.parse(input.reactionKey),
        prior = comment.reactions.find((row) => row.key === key),
        members = new Set(prior?.memberIds ?? []),
        before = members.has(data.currentMemberId);
      if (id === 'addCommentReaction') members.add(data.currentMemberId);
      else members.delete(data.currentMemberId);
      if (before !== members.has(data.currentMemberId)) {
        const reactions = comment.reactions.filter((row) => row.key !== key);
        if (members.size) reactions.push({ key, count: members.size, memberIds: [...members] });
        data.comments[comment.id] = { ...comment, version: comment.version + 1, reactions };
        touchComments(data, task, clock);
      }
      return { data: data.comments[comment.id]!.reactions };
    }
    default:
      throw new TypeError('Unsupported comments operation');
  }
}
