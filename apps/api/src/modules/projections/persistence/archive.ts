import type { ArchiveQuerySchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { localeTupleSeek } from '../../../db/locale-seek.ts';
import { historySeek } from '../../../db/history-seek.ts';
import type { CursorPayload } from '../../../shared/cursor.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import { textKeyVersion } from '../../../shared/text-key-encoder.ts';
import { readAccessSql } from '../../projects/access.ts';
import { taskSelect } from '../../tasks/projections.ts';
import type { TaskProjection, TaskCountGroup } from '../../tasks/projections.ts';
export interface ArchiveTuple {
  id: string;
  value: string | number;
}
export async function archivePage(
  repository: RequestRepository,
  scope: WorkspaceContext,
  query: z.infer<typeof ArchiveQuerySchema>,
  needle: string,
  cursor: CursorPayload | null,
): Promise<{ rows: ArchiveTuple[]; total: number }> {
  const tasks = query.kind === 'tasks',
    invalid = `json_extract(${tasks ? 't' : 'p'}.readKeys,'$.v') IS NOT '${textKeyVersion}'`;
  const from = tasks
    ? 'tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId'
    : 'projects p';
  const where = tasks
    ? [
        `t.workspaceId=?`,
        `t.archivedAt IS NOT NULL`,
        `t.deletedAt IS NULL`,
        `p.archivedAt IS NULL`,
        `p.deletedAt IS NULL`,
        readAccessSql,
      ]
    : [`p.workspaceId=?`, `p.archivedAt IS NOT NULL`, `p.deletedAt IS NULL`, readAccessSql];
  const parameters: (string | number | null)[] = [scope.workspaceId, scope.memberId];
  if (needle) {
    where.push(
      `((${invalid}) OR instr(${tasks ? "json_extract(t.readKeys,'$.title.fold')||' '||lower(p.key||'-'||t.number)" : "json_extract(p.readKeys,'$.name.fold')"},?)>0)`,
    );
    parameters.push(needle);
  }
  const predicate = where.map((sql) => `(${sql})`).join(' AND ');
  const count = required(
    (
      await repository.all<{ total: number; invalidKeys: number }>(
        `SELECT count(*) total,coalesce(sum(${invalid}),0) invalidKeys FROM ${from} WHERE ${predicate}`,
        parameters,
      )
    )[0],
    'Missing archive count',
  );
  if (count.invalidKeys)
    throw new ApiFailure('INTERNAL_ERROR', 'Read-key migration must be completed');
  const seek = cursor
    ? tasks
      ? historySeek('t.archivedAt', 't.id', cursor, 'desc', 'asc')
      : localeTupleSeek('p.rowid', 'p.id', cursor, 'asc', 'asc', 'numeric')
    : { sql: '1', parameters: [] };
  const rows = await repository.all<ArchiveTuple>(
    `SELECT ${tasks ? 't.id' : 'p.id'} id,${tasks ? "strftime('%Y-%m-%dT%H:%M:%fZ',t.archivedAt/1000.0,'unixepoch')" : 'p.rowid'} value FROM ${from} WHERE ${predicate} AND ${seek.sql} ORDER BY ${tasks ? 't.archivedAt DESC,t.id ASC' : 'p.rowid ASC,p.id ASC'} LIMIT ?`,
    [...parameters, ...seek.parameters, query.limit + 1],
  );
  return { rows, total: count.total };
}
export function archiveTasksByIds(
  repository: RequestRepository,
  scope: WorkspaceContext,
  ids: readonly string[],
) {
  return repository.all<TaskProjection>(
    `${taskSelect} WHERE t.workspaceId=? AND t.id IN (SELECT value FROM json_each(?)) AND t.archivedAt IS NOT NULL AND t.deletedAt IS NULL AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${readAccessSql}`,
    [scope.memberId, scope.memberId, scope.workspaceId, JSON.stringify(ids), scope.memberId],
  );
}
export interface ArchiveProjectGroup extends TaskCountGroup {
  projectId: string;
}
export function archiveProjectGroups(
  repository: RequestRepository,
  scope: WorkspaceContext,
  ids: readonly string[],
  date: string,
) {
  return repository.all<ArchiveProjectGroup>(
    `SELECT t.projectId,t.status,t.priority,count(*) total,sum(t.status!='done' AND t.dueDate IS NOT NULL AND t.dueDate<?) overdue,sum((SELECT count(*) FROM subtasks c WHERE c.workspaceId=t.workspaceId AND c.taskId=t.id)) subtaskTotal,sum((SELECT count(*) FROM subtasks c WHERE c.workspaceId=t.workspaceId AND c.taskId=t.id AND c.done=1)) subtaskCompleted FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId WHERE t.workspaceId=? AND t.projectId IN (SELECT value FROM json_each(?)) AND t.deletedAt IS NULL AND p.archivedAt IS NOT NULL AND p.deletedAt IS NULL AND ${readAccessSql} GROUP BY t.projectId,t.status,t.priority`,
    [date, scope.workspaceId, JSON.stringify(ids), scope.memberId],
  );
}
