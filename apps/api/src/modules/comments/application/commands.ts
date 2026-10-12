import type { CreateCommentInput, EntityId, ReactionDto } from '@studio/contracts/api';
import { EntityIdSchema } from '@studio/contracts/api';
import { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { commandUndoRecords } from '../../../db/schema.ts';
import {
  decodeUndoPayload,
  decodeUndoResult,
  encodeUndoPayload,
  encodeUndoResult,
} from '../../../db/undo.ts';
import { instant } from '../../../shared/clock.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { historyPage } from '../../collaboration-page.ts';
import { childGate, writableTask } from '../../tasks/aggregate.ts';
import { taskDto, taskRow } from '../../tasks/index.ts';
import { commentDto, reactionProjection } from '../mapper.ts';
import type { CommentRow } from '../persistence/commands-model.ts';
import {
  commentRowReadComments,
  createCommentBudget,
  createCommentCommit,
  createCommentInsertActivity,
  createCommentInsertComments,
  createCommentPredicateJson,
  createCommentPrepare,
  createCommentRead,
  lifecycleCommentBudget,
  lifecycleCommentCommit,
  lifecycleCommentPredicateComments,
  lifecycleCommentPrepare,
  lifecycleCommentPrepareCommandUndoRecords,
  lifecycleCommentPrepareComments,
  listCommentsReadCommentReactions,
  reactCommentBudget,
  reactCommentCommit,
  reactCommentInsertCommentReactions,
  reactCommentPredicateComments,
  reactCommentPrepareCommentReactions,
  reactCommentPrepareComments,
  reactionsReadCommentReactions,
  undoCommentBudget,
  undoCommentCommit,
  undoCommentPredicateComments,
  undoCommentPrepareCommandUndoRecords,
  undoCommentPrepareComments,
  undoCommentReadCommandUndoRecords,
  undoCommentReadComments,
  undoCommentReadProjects,
  undoCommentReadTasks,
} from '../persistence/commands.ts';
const ReactionPairsSchema = z.array(z.object({ key: z.string(), memberId: EntityIdSchema }));

export async function commentRow(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  deleted = false,
) {
  const [row] = await commentRowReadComments(r, deleted, s, id);
  if (!row) throw new ApiFailure('NOT_FOUND', 'Comment not found');
  await taskRow(r, s, EntityIdSchema.parse(row.taskId));
  return row;
}
async function reactions(
  r: RequestRepository,
  s: WorkspaceContext,
  id: string,
): Promise<ReactionDto[]> {
  const rows = await reactionsReadCommentReactions(r, s, id);
  return reactionProjection(rows.map((row) => ({ key: row.reactionKey, memberId: row.memberId })));
}
async function readCommentDto(r: RequestRepository, s: WorkspaceContext, row: CommentRow) {
  return commentDto(row, await reactions(r, s, row.id));
}
export async function listComments(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  query: { cursor?: string | undefined; limit: number },
) {
  await taskRow(r, s, id);
  // One query projects all reactions, so pagination never spends one query per child.
  const rows = await listCommentsReadCommentReactions(r, s, id);
  const items = rows.map((row) => {
    const values = ReactionPairsSchema.parse(JSON.parse(row.reactionsJson));
    return commentDto(row, reactionProjection(values));
  });
  return historyPage(items, query, { scope: s, kind: 'comments', taskId: id });
}
export async function createComment(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: CreateCommentInput,
  now: number,
  generateId: IdGenerator = newId,
) {
  const task = await writableTask(r, s, id),
    mentions = JSON.stringify(body.mentionedMemberIds);
  const guard = {
    sql: createCommentPredicateJson(),
    parameters: [mentions, s.workspaceId],
  };
  const [valid] = await createCommentRead(r, guard);
  if (!valid?.valid)
    throw new ApiFailure('VALIDATION_ERROR', 'Mentioned member is not in this workspace');
  const marker = generateId(),
    row: CommentRow = {
      id: generateId(),
      workspaceId: s.workspaceId,
      taskId: id,
      authorId: s.memberId,
      bodyText: body.bodyText,
      mentionedMemberIdsJson: mentions,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedBy: null,
      version: 1,
      lastMutationId: marker,
    };
  const { root, gate } = childGate(r, s, task, marker, now, [guard], null),
    statements = [
      root,
      createCommentInsertComments(r, row, gate),
      createCommentInsertActivity(r, s, task, now, marker, gate, generateId),
      createCommentPrepare(r, gate, s, id),
    ];
  createCommentBudget(r, statements);
  const result = await createCommentCommit(r, statements);
  return {
    comment: await readCommentDto(r, s, row),
    task: taskDto(
      required(
        required(result.at(-1), 'Missing comments state').results[0],
        'Missing task projection',
      ),
    ),
    undo: null,
  };
}
export async function lifecycleComment(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  expectedVersion: number,
  restore: boolean,
  now: number,
  generateId: IdGenerator = newId,
) {
  const old = await commentRow(r, s, id, restore);
  if (old.authorId !== s.memberId) throw new ApiFailure('NOT_FOUND', 'Comment not found');
  if (
    old.version !== expectedVersion ||
    (restore && (old.deletedAt === null || old.deletedBy !== s.memberId))
  )
    throw new ApiFailure('CONFLICT', 'Comment version or lifecycle changed');
  const task = await writableTask(r, s, EntityIdSchema.parse(old.taskId)),
    marker = generateId();
  const guard = {
    sql: lifecycleCommentPredicateComments(),
    parameters: [
      s.workspaceId,
      id,
      task.id,
      s.memberId,
      expectedVersion,
      old.deletedAt,
      old.deletedBy,
    ],
  };
  const { root, gate } = childGate(r, s, task, marker, now, [guard]),
    row = {
      ...old,
      version: old.version + 1,
      updatedAt: now,
      deletedAt: restore ? null : now,
      deletedBy: restore ? null : s.memberId,
      lastMutationId: marker,
    };
  const undo = restore ? null : { id: generateId(), kind: 'comment.delete' as const };
  const payload = undo
    ? encodeUndoPayload({
        kind: 'comment.delete',
        targets: [
          {
            id,
            postVersion: row.version,
            taskId: task.id,
            taskPostVersion: task.version + 1,
            before: {
              archivedAt: null,
              deletedAt: old.deletedAt,
              deletedBy: old.deletedBy,
              updatedAt: instant(old.updatedAt),
            },
          },
        ],
        activityIds: [],
      })
    : null;
  const statements = [root, lifecycleCommentPrepareComments(r, gate, now, row, marker, s, id)];
  if (undo)
    statements.push(
      lifecycleCommentPrepareCommandUndoRecords(r, gate, undo, id, s, payload, task, now),
    );
  statements.push(lifecycleCommentPrepare(r, gate, s, task));
  lifecycleCommentBudget(r, statements);
  const result = await lifecycleCommentCommit(r, statements);
  return {
    comment: await readCommentDto(r, s, row),
    task: taskDto(
      required(
        required(result.at(-1), 'Missing comments state').results[0],
        'Missing task projection',
      ),
    ),
    undo,
  };
}
export async function reactComment(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  key: string,
  add: boolean,
  now: number,
  generateId: IdGenerator = newId,
) {
  const old = await commentRow(r, s, id),
    task = await writableTask(r, s, EntityIdSchema.parse(old.taskId)),
    marker = generateId();
  const current = await reactions(r, s, id),
    exists = current.some((row) => row.key === key && row.memberIds.includes(s.memberId));
  if (exists === add) return current;
  const guard = {
    sql: reactCommentPredicateComments(add),
    parameters: [s.workspaceId, id, task.id, s.workspaceId, id, s.memberId, key],
  };
  const { root, gate } = childGate(r, s, task, marker, now, [guard], null),
    statements = [root, reactCommentPrepareComments(r, gate, now, marker, s, id)];
  statements.push(
    add
      ? reactCommentInsertCommentReactions(r, s, id, key, now, gate)
      : reactCommentPrepareCommentReactions(r, gate, s, id, key),
  );
  reactCommentBudget(r, statements);
  const results = await reactCommentCommit(r, statements);
  if (results[0]?.meta.changes !== 1) {
    // Concurrent identical operations replay the authorized current state without writes.
    const row = await commentRow(r, s, id);
    await writableTask(r, s, EntityIdSchema.parse(row.taskId));
    const latest = await reactions(r, s, id);
    if (latest.some((row) => row.key === key && row.memberIds.includes(s.memberId)) !== add)
      throw new ApiFailure('CONFLICT', 'Comment scope or reaction changed');
    return latest;
  }
  return reactions(r, s, id);
}
export async function undoComment(
  r: RequestRepository,
  s: WorkspaceContext,
  record: typeof commandUndoRecords.$inferSelect,
  now: number,
  generateId: IdGenerator = newId,
) {
  const payload = decodeUndoPayload(record.payloadJson);
  if (payload.kind !== 'comment.delete' || record.kind !== payload.kind)
    throw new ApiFailure('INTERNAL_ERROR', 'Invalid comment Undo');
  const target = required(payload.targets[0], 'Missing comments state'),
    [old] = await undoCommentReadComments(r, s, target);
  if (!old || old.taskId !== target.taskId) throw new ApiFailure('NOT_FOUND', 'Comment not found');
  const [parent] = await undoCommentReadTasks(r, s, target);
  if (!parent) throw new ApiFailure('NOT_FOUND', 'Task not found');
  const [project] = await undoCommentReadProjects(r, s, parent);
  if (!project) throw new ApiFailure('NOT_FOUND', 'Project not found');
  if (!project.allowed) throw new ApiFailure('FORBIDDEN', 'Undo project access required');
  if (parent.deletedAt !== null || project.archivedAt !== null || project.deletedAt !== null)
    throw new ApiFailure('CONFLICT', 'Undo parent lifecycle changed');
  const task = await taskRow(r, s, target.taskId);
  if (record.resultJson !== null) return decodeUndoResult(record.resultJson);
  if (task.archivedAt !== null) throw new ApiFailure('CONFLICT', 'Restore task before Undo');
  const marker = generateId(),
    guard = {
      sql: undoCommentPredicateComments(),
      parameters: [
        s.workspaceId,
        target.id,
        target.taskId,
        s.memberId,
        target.postVersion,
        record.createdAt,
        s.memberId,
        s.workspaceId,
        record.id,
        s.memberId,
      ],
    };
  const { root, gate } = childGate(r, s, task, marker, now, [guard], target.taskPostVersion),
    result = encodeUndoResult({
      undoId: record.id,
      kind: payload.kind,
      appliedAt: instant(now),
      affected: {
        taskIds: [task.id],
        projectIds: [task.projectId],
        teamIds: [],
        memberIds: [],
        commentIds: [target.id],
        fileIds: [],
      },
    });
  const statements = [
    root,
    undoCommentPrepareComments(r, gate, now, marker, s, target),
    undoCommentPrepareCommandUndoRecords(r, gate, now, result, s, record),
  ];
  undoCommentBudget(r, statements);
  const results = await undoCommentCommit(r, statements);
  if (results[0]?.meta.changes !== 1) {
    const [latest] = await undoCommentReadCommandUndoRecords(r, s, record);
    if (latest?.resultJson) return decodeUndoResult(latest.resultJson);
    throw new ApiFailure('CONFLICT', 'Comment Undo targets changed');
  }
  return decodeUndoResult(result);
}
