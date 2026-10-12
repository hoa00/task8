import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { actorParameters, actorSql, writeAccessSql } from '../../projects/index.ts';
import type { TaskProjection } from './model.ts';

export function childGate(
  r: RequestRepository,
  s: WorkspaceContext,
  t: TaskProjection,
  marker: string,
  now: number,
  guards: SqlPredicate[] = [],
  expectedVersion: number | null = t.version,
) {
  const gate = {
    sql: 'EXISTS (SELECT 1 FROM tasks gate WHERE gate.workspaceId=? AND gate.id=? AND gate.lastMutationId=?)',
    parameters: [s.workspaceId, t.id, marker],
  };
  const root = r.prepare(
    `UPDATE tasks SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND projectId=? ${expectedVersion === null ? '' : 'AND version=?'} AND archivedAt IS NULL AND deletedAt IS NULL AND ${actorSql()} AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${writeAccessSql}) ${guards.map((g) => `AND (${g.sql})`).join(' ')}`,
    [
      now,
      marker,
      s.workspaceId,
      t.id,
      t.projectId,
      ...(expectedVersion === null ? [] : [expectedVersion]),
      ...actorParameters(s),
      s.memberId,
      ...guards.flatMap((g) => g.parameters),
    ],
  );
  return { root, gate };
}
export function childEvent(
  s: WorkspaceContext,
  t: TaskProjection,
  now: number,
  eventType: string,
  detail?: string,
  ids: IdGenerator = newId,
) {
  return {
    id: ids(),
    workspaceId: s.workspaceId,
    projectId: t.projectId,
    taskId: t.id,
    actorId: s.memberId,
    eventType,
    payloadJson: JSON.stringify({
      taskKey: `${t.projectKey}-${t.number}`,
      taskTitle: t.title,
      ...(detail ? { detail } : {}),
    }),
    commandId: null,
    revertedAt: null,
    createdAt: now,
  };
}
