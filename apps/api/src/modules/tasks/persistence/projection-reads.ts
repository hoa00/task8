import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { readAccessSql } from '../../projects/access.ts';
import type { TaskProjection } from './model.ts';
import { taskSelect } from './reads.ts';
export type TaskProjectionScope =
  | { kind: 'ids'; ids: readonly string[] }
  | { kind: 'mine'; memberId: string }
  | { kind: 'deadlines'; from: string; to: string };
export function selectedTaskProjections(
  repository: RequestRepository,
  scope: WorkspaceContext,
  selection: TaskProjectionScope,
) {
  const where = [
    't.workspaceId=?',
    't.archivedAt IS NULL',
    't.deletedAt IS NULL',
    'p.archivedAt IS NULL',
    'p.deletedAt IS NULL',
    readAccessSql,
  ];
  const parameters: (string | number | null)[] = [
    scope.memberId,
    scope.memberId,
    scope.workspaceId,
    scope.memberId,
  ];
  if (selection.kind === 'ids') {
    where.push('t.id IN (SELECT value FROM json_each(?))');
    parameters.push(JSON.stringify(selection.ids));
  }
  if (selection.kind === 'mine') {
    where.push('t.assigneeId=?');
    parameters.push(selection.memberId);
  }
  if (selection.kind === 'deadlines') {
    where.push("t.status!='done' AND t.dueDate BETWEEN ? AND ?");
    parameters.push(selection.from, selection.to);
  }
  // Complete preview sets retain the qualified aggregate's entity order, including
  // stable priority/date ties. A paged search hydrates these rows by selected ID.
  return repository.all<TaskProjection>(
    `${taskSelect} WHERE ${where.map((sql) => `(${sql})`).join(' AND ')} ORDER BY (t.readKeys ->> '$.title.foldedUtf16'),t.id`,
    parameters,
  );
}
