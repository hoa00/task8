import type { Priority, TaskStatus, TaskQuery, TaskSummaryDto } from '@studio/contracts/api';
import { taskSummaryFromGroups } from '../domain/summary.ts';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { CursorPayload } from '../../../shared/cursor.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { TaskProjection } from './model.ts';
import type { TaskQueryPlan, TaskReadEnvironment } from './query-compiler.ts';
import { compileTaskQuery, taskSeek } from './query-compiler.ts';
import { taskProjectionColumns } from './reads.ts';
export interface TaskPageProjection extends TaskProjection {
  readSortValue: string | number | null;
}
export function taskReadPlan(
  scope: WorkspaceContext,
  query: TaskQuery,
  environment: TaskReadEnvironment,
): TaskQueryPlan {
  return compileTaskQuery(scope, query, environment);
}
export async function taskQueryCount(
  repository: RequestRepository,
  plan: TaskQueryPlan,
): Promise<number> {
  const rows = await repository.all<{ total: number; invalidKeys: number }>(
    `${plan.inputSql} SELECT count(*) total,coalesce(sum(${plan.invalidKeysSql}),0) invalidKeys FROM ${plan.fromSql} WHERE ${plan.where.sql}`,
    plan.where.parameters,
  );
  const row = required(rows[0], 'Missing task count');
  if (row.invalidKeys)
    throw new ApiFailure('INTERNAL_ERROR', 'Read-key migration must be completed');
  return row.total;
}
export async function taskQueryPage(
  repository: RequestRepository,
  scope: WorkspaceContext,
  query: TaskQuery,
  plan: TaskQueryPlan,
  cursor: CursorPayload | null,
): Promise<TaskPageProjection[]> {
  const seek = cursor
    ? taskSeek(plan.sort, cursor, query.sortDirection)
    : { sql: '1', parameters: [] };
  const sort = plan.sort;
  const numeric = sort.kind === 'text' ? sort.numericSql : 'NULL',
    numericType = sort.kind === 'text' ? sort.numericTypeSql : "'finite'";
  const direction = query.sortDirection === 'desc' ? 'DESC' : 'ASC';
  return repository.all<TaskPageProjection>(
    `${plan.inputSql},filtered AS (SELECT t.id,${sort.valueSql} readSortValue,${sort.keySql} readSortKey,${numeric} readNumeric,${numericType} readNumericType FROM ${plan.fromSql} WHERE ${plan.where.sql}),selected AS (SELECT * FROM filtered WHERE ${seek.sql} ORDER BY readSortKey ${direction},id ASC LIMIT ?) SELECT ${taskProjectionColumns},selected.readSortValue FROM selected JOIN tasks t ON t.id=selected.id JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId ORDER BY selected.readSortKey ${direction},selected.id ASC`,
    [...plan.where.parameters, ...seek.parameters, query.limit + 1, scope.memberId, scope.memberId],
  );
}
interface TaskSummaryGroup {
  status: TaskStatus;
  priority: Priority;
  total: number;
  overdue: number;
  subtaskTotal: number;
  subtaskCompleted: number;
  invalidKeys: number;
}
export async function taskQuerySummary(
  repository: RequestRepository,
  plan: TaskQueryPlan,
): Promise<TaskSummaryDto> {
  const groups = await repository.all<TaskSummaryGroup>(
    `${plan.inputSql} SELECT t.status,t.priority,count(*) total,sum(t.status!='done' AND t.dueDate IS NOT NULL AND t.dueDate<json_extract(qi.doc,'$.today')) overdue,sum((SELECT count(*) FROM subtasks c WHERE c.workspaceId=t.workspaceId AND c.taskId=t.id)) subtaskTotal,sum((SELECT count(*) FROM subtasks c WHERE c.workspaceId=t.workspaceId AND c.taskId=t.id AND c.done=1)) subtaskCompleted,sum(${plan.invalidKeysSql}) invalidKeys FROM ${plan.fromSql} WHERE ${plan.where.sql} GROUP BY t.status,t.priority`,
    plan.where.parameters,
  );
  if (groups.some((group) => group.invalidKeys))
    throw new ApiFailure('INTERNAL_ERROR', 'Read-key migration must be completed');
  return taskSummaryFromGroups(groups);
}
