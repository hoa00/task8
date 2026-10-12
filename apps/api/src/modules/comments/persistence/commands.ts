import type { EntityId, Instant } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { fitBatch, gatedInsert, matchedBatch } from '../../../db/commands.ts';
import { textKeyEncoder } from '../../../shared/collation/encoder.ts';
import { required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { writeAccessSql } from '../../projects/access.ts';
import { childEvent } from '../../tasks/aggregate.ts';
import { taskSelect } from '../../tasks/index.ts';
import type { TaskProjection } from '../../tasks/projections.ts';
import { commentReadTextKeys } from '../domain/read-text.ts';
import type { CommentRow } from './commands-model.ts';
export function commentRowReadComments(
  r: RequestRepository,
  deleted: boolean,
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.all<CommentRow>(
    `SELECT * FROM comments WHERE workspaceId=? AND id=? ${deleted ? '' : 'AND deletedAt IS NULL'}`,
    [s.workspaceId, id],
  );
}
export function reactionsReadCommentReactions(
  r: RequestRepository,
  s: WorkspaceContext,
  id: string,
) {
  return r.all<{ reactionKey: string; memberId: string }>(
    'SELECT reactionKey,memberId FROM commentReactions WHERE workspaceId=? AND commentId=? ORDER BY reactionKey,memberId',
    [s.workspaceId, id],
  );
}
export function createCommentPredicateJson() {
  return 'NOT EXISTS (SELECT 1 FROM json_each(?) mention WHERE NOT EXISTS (SELECT 1 FROM workspaceMembers m WHERE m.workspaceId=? AND m.id=mention.value AND m.removedAt IS NULL))';
}
export function createCommentRead(
  r: RequestRepository,
  guard: { sql: string; parameters: string[] },
) {
  return r.all<{ valid: number }>(`SELECT ${guard.sql} valid`, guard.parameters);
}
export function createCommentInsertComments(
  r: RequestRepository,
  row: CommentRow,
  gate: { sql: string; parameters: string[] },
) {
  return gatedInsert(
    r,
    'comments',
    [{ ...row, readKeys: commentReadTextKeys(row, textKeyEncoder) }],
    gate,
  );
}
export function createCommentInsertActivity(
  r: RequestRepository,
  s: WorkspaceContext,
  task: TaskProjection,
  now: number,
  marker: EntityId,
  gate: { sql: string; parameters: string[] },
  generateId: IdGenerator = newId,
) {
  return gatedInsert(
    r,
    'activity',
    [{ ...childEvent(s, task, now, 'comment.created', undefined, generateId), commandId: marker }],
    gate,
  );
}
export function createCommentPrepare(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.prepare(`${taskSelect} WHERE t.workspaceId=? AND t.id=? AND ${gate.sql}`, [
    s.memberId,
    s.memberId,
    s.workspaceId,
    id,
    ...gate.parameters,
  ]);
}
export function createCommentBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 1);
}
export function createCommentCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return matchedBatch<TaskProjection>(r, statements);
}
export function lifecycleCommentPredicateComments() {
  return 'EXISTS (SELECT 1 FROM comments WHERE workspaceId=? AND id=? AND taskId=? AND authorId=? AND version=? AND deletedAt IS ? AND deletedBy IS ?)';
}
export function lifecycleCommentPrepareComments(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  now: number,
  row: {
    version: number;
    updatedAt: number;
    deletedAt: number | null;
    deletedBy: EntityId | null;
    lastMutationId: EntityId;
    id: string;
    workspaceId: string;
    createdAt: number;
    taskId: string;
    authorId: string;
    bodyText: string;
    mentionedMemberIdsJson: string;
  },
  marker: EntityId,
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.prepare(
    `UPDATE comments SET version=version+1,updatedAt=?,deletedAt=?,deletedBy=?,lastMutationId=? WHERE workspaceId=? AND id=? AND ${gate.sql}`,
    [now, row.deletedAt, row.deletedBy, marker, s.workspaceId, id, ...gate.parameters],
  );
}
export function lifecycleCommentPrepareCommandUndoRecords(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  undo: { id: EntityId; kind: 'comment.delete' },
  id: EntityId,
  s: WorkspaceContext,
  payload: string | null,
  task: TaskProjection,
  now: number,
) {
  return r.prepare(
    `INSERT INTO commandUndoRecords(id,workspaceId,actorMemberId,kind,payloadVersion,payloadJson,createdAt,consumedAt,resultJson) SELECT ?,?,?,?,1,json_set(?,'$.targets[0].postVersion',(SELECT version FROM comments WHERE workspaceId=? AND id=?),'$.targets[0].taskPostVersion',(SELECT version FROM tasks WHERE workspaceId=? AND id=?)),?,NULL,NULL WHERE ${gate.sql}`,
    [
      undo.id,
      s.workspaceId,
      s.memberId,
      undo.kind,
      required(payload, 'Missing comment Undo payload'),
      s.workspaceId,
      id,
      s.workspaceId,
      task.id,
      now,
      ...gate.parameters,
    ],
  );
}
export function lifecycleCommentPrepare(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  s: WorkspaceContext,
  task: TaskProjection,
) {
  return r.prepare(`${taskSelect} WHERE t.workspaceId=? AND t.id=? AND ${gate.sql}`, [
    s.memberId,
    s.memberId,
    s.workspaceId,
    task.id,
    ...gate.parameters,
  ]);
}
export function lifecycleCommentBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 1);
}
export function lifecycleCommentCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return matchedBatch<TaskProjection>(r, statements);
}
export function reactCommentPredicateComments(add: boolean) {
  return `EXISTS (SELECT 1 FROM comments WHERE workspaceId=? AND id=? AND taskId=? AND deletedAt IS NULL) AND ${add ? 'NOT ' : ''}EXISTS (SELECT 1 FROM commentReactions WHERE workspaceId=? AND commentId=? AND memberId=? AND reactionKey=?)`;
}
export function reactCommentPrepareComments(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  now: number,
  marker: EntityId,
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.prepare(
    `UPDATE comments SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND ${gate.sql}`,
    [now, marker, s.workspaceId, id, ...gate.parameters],
  );
}
export function reactCommentInsertCommentReactions(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  key: string,
  now: number,
  gate: { sql: string; parameters: string[] },
) {
  return gatedInsert(
    r,
    'commentReactions',
    [
      {
        workspaceId: s.workspaceId,
        commentId: id,
        memberId: s.memberId,
        reactionKey: key,
        createdAt: now,
      },
    ],
    gate,
  );
}
export function reactCommentPrepareCommentReactions(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  s: WorkspaceContext,
  id: EntityId,
  key: string,
) {
  return r.prepare(
    `DELETE FROM commentReactions WHERE workspaceId=? AND commentId=? AND memberId=? AND reactionKey=? AND ${gate.sql}`,
    [s.workspaceId, id, s.memberId, key, ...gate.parameters],
  );
}
export function reactCommentBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 5);
}
export function reactCommentCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return r.batch(statements);
}
export function undoCommentReadComments(
  r: RequestRepository,
  s: WorkspaceContext,
  target: {
    before: {
      archivedAt: Instant | null;
      deletedAt: Instant | null;
      deletedBy: EntityId | null;
      updatedAt: Instant;
    };
    id: EntityId;
    postVersion: number;
    taskId: EntityId;
    taskPostVersion: number;
  },
) {
  return r.all<CommentRow>('SELECT * FROM comments WHERE workspaceId=? AND id=? AND authorId=?', [
    s.workspaceId,
    target.id,
    s.memberId,
  ]);
}
export function undoCommentReadTasks(
  r: RequestRepository,
  s: WorkspaceContext,
  target: {
    before: {
      archivedAt: Instant | null;
      deletedAt: Instant | null;
      deletedBy: EntityId | null;
      updatedAt: Instant;
    };
    id: EntityId;
    postVersion: number;
    taskId: EntityId;
    taskPostVersion: number;
  },
) {
  return r.all<{ projectId: string; deletedAt: number | null }>(
    'SELECT projectId,deletedAt FROM tasks WHERE workspaceId=? AND id=?',
    [s.workspaceId, target.taskId],
  );
}
export function undoCommentReadProjects(
  r: RequestRepository,
  s: WorkspaceContext,
  parent: { projectId: string; deletedAt: number | null },
) {
  return r.all<{
    allowed: number;
    archivedAt: number | null;
    deletedAt: number | null;
  }>(
    `SELECT ${writeAccessSql} allowed,p.archivedAt,p.deletedAt FROM projects p WHERE p.workspaceId=? AND p.id=?`,
    [s.memberId, s.workspaceId, parent.projectId],
  );
}
export function undoCommentPredicateComments() {
  return 'EXISTS (SELECT 1 FROM comments WHERE workspaceId=? AND id=? AND taskId=? AND authorId=? AND version=? AND deletedAt=? AND deletedBy=?) AND EXISTS (SELECT 1 FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL)';
}
export function undoCommentPrepareComments(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  now: number,
  marker: EntityId,
  s: WorkspaceContext,
  target: {
    before: {
      archivedAt: Instant | null;
      deletedAt: Instant | null;
      deletedBy: EntityId | null;
      updatedAt: Instant;
    };
    id: EntityId;
    postVersion: number;
    taskId: EntityId;
    taskPostVersion: number;
  },
) {
  return r.prepare(
    `UPDATE comments SET deletedAt=NULL,deletedBy=NULL,updatedAt=?,version=version+1,lastMutationId=? WHERE workspaceId=? AND id=? AND ${gate.sql}`,
    [now, marker, s.workspaceId, target.id, ...gate.parameters],
  );
}
export function undoCommentPrepareCommandUndoRecords(
  r: RequestRepository,
  gate: { sql: string; parameters: string[] },
  now: number,
  result: string,
  s: WorkspaceContext,
  record: {
    id: string;
    workspaceId: string;
    createdAt: number;
    payloadJson: string;
    actorMemberId: string;
    kind: string;
    payloadVersion: number;
    consumedAt: number | null;
    resultJson: string | null;
  },
) {
  return r.prepare(
    `UPDATE commandUndoRecords SET consumedAt=?,resultJson=? WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL AND ${gate.sql}`,
    [now, result, s.workspaceId, record.id, s.memberId, ...gate.parameters],
  );
}
export function undoCommentBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 1);
}
export function undoCommentCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return r.batch(statements);
}
export function undoCommentReadCommandUndoRecords(
  r: RequestRepository,
  s: WorkspaceContext,
  record: {
    id: string;
    workspaceId: string;
    createdAt: number;
    payloadJson: string;
    actorMemberId: string;
    kind: string;
    payloadVersion: number;
    consumedAt: number | null;
    resultJson: string | null;
  },
) {
  return r.all<{ resultJson: string | null }>(
    'SELECT resultJson FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=?',
    [s.workspaceId, record.id, s.memberId],
  );
}
