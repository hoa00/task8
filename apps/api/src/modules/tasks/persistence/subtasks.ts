import { textKeyEncoder } from '../../../shared/collation/encoder.ts';
import { taskReadTextKeys } from '../domain/read-text.ts';
export type SubtaskWritePlan =
  | { kind: 'create'; child: SubtaskRow }
  | { kind: 'update' | 'delete'; child: SubtaskRow; old: SubtaskRow }
  | { kind: 'promote'; child: SubtaskRow; old: SubtaskRow; created: TaskRow };
import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import { fitBatch, gatedInsert, matchedBatch } from '../../../db/commands.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { childEvent, childGate } from './aggregate.ts';
import type { SubtaskRow, TaskProjection, TaskRow } from './model.ts';
import { taskSelect } from './reads.ts';
import { labelIds } from './values.ts';

export async function commitSubtask(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  task: TaskProjection,
  plan: SubtaskWritePlan,
  marker: string,
  now: number,
  guards: SqlPredicate[],
  ids: IdGenerator,
) {
  const operation = plan.kind,
    child = plan.child,
    old = plan.kind === 'create' ? undefined : plan.old,
    created = plan.kind === 'promote' ? plan.created : undefined;
  const { root, gate } = childGate(r, s, task, marker, now, guards),
    statements = [root];
  if (operation === 'create')
    statements.push(gatedInsert(r, 'subtasks', [{ ...child, done: child.done ? 1 : 0 }], gate));
  else if (operation === 'update')
    statements.push(
      r.prepare(
        `UPDATE subtasks SET title=?,done=?,assigneeId=?,dueDate=?,note=?,updatedAt=? WHERE workspaceId=? AND taskId=? AND id=? AND ${gate.sql}`,
        [
          child.title,
          child.done ? 1 : 0,
          child.assigneeId,
          child.dueDate,
          child.note,
          now,
          s.workspaceId,
          id,
          child.id,
          ...gate.parameters,
        ],
      ),
    );
  else
    statements.push(
      r.prepare(`DELETE FROM subtasks WHERE workspaceId=? AND taskId=? AND id=? AND ${gate.sql}`, [
        s.workspaceId,
        id,
        requireChild(old).id,
        ...gate.parameters,
      ]),
    );
  if (created) {
    statements.push(
      r.prepare(
        `UPDATE projects SET taskSequence=taskSequence+1 WHERE workspaceId=? AND id=? AND ${gate.sql}`,
        [s.workspaceId, task.projectId, ...gate.parameters],
      ),
    );
    const normalized = { ...created, readKeys: taskReadTextKeys(created, textKeyEncoder) },
      columns = Object.keys(normalized),
      json = JSON.stringify(normalized);
    statements.push(
      r.prepare(
        `INSERT INTO tasks(${columns.join(',')}) SELECT ${columns.map((c) => (c === 'number' ? 'p.taskSequence' : c === 'position' ? '(SELECT max(0,coalesce(max(position),0))+100 FROM tasks WHERE workspaceId=?)' : `json_extract(?,'$.${c}')`)).join(',')} FROM projects p WHERE p.workspaceId=? AND p.id=? AND ${gate.sql}`,
        [
          ...columns
            .filter((c) => c !== 'number')
            .map((c) => (c === 'position' ? s.workspaceId : json)),
          s.workspaceId,
          task.projectId,
          ...gate.parameters,
        ],
      ),
    );
    const labels = labelIds(task);
    if (labels.length)
      statements.push(
        gatedInsert(
          r,
          'taskLabels',
          labels.map((labelId) => ({ workspaceId: s.workspaceId, taskId: created.id, labelId })),
          gate,
        ),
      );
    const parentEvent = childEvent(s, task, now, 'task.updated', undefined, ids),
      newEvent = childEvent(s, { ...task, ...created }, now, 'task.created', undefined, ids);
    statements.push(
      r.prepare(
        `INSERT INTO activity(id,workspaceId,projectId,taskId,actorId,eventType,payloadJson,commandId,revertedAt,createdAt) SELECT ?,?,?,?,?,?,json_set(?,'$.detail','converted a subtask into '||?||'-'||p.taskSequence),?,NULL,? FROM projects p WHERE p.workspaceId=? AND p.id=? AND ${gate.sql}`,
        [
          parentEvent.id,
          s.workspaceId,
          task.projectId,
          id,
          s.memberId,
          'task.updated',
          parentEvent.payloadJson,
          task.projectKey,
          marker,
          now,
          s.workspaceId,
          task.projectId,
          ...gate.parameters,
        ],
      ),
    );
    statements.push(
      r.prepare(
        `INSERT INTO activity(id,workspaceId,projectId,taskId,actorId,eventType,payloadJson,commandId,revertedAt,createdAt) SELECT ?,?,?,?,?,?,json_set(?,'$.taskKey',?||'-'||p.taskSequence),?,NULL,? FROM projects p WHERE p.workspaceId=? AND p.id=? AND ${gate.sql}`,
        [
          newEvent.id,
          s.workspaceId,
          task.projectId,
          created.id,
          s.memberId,
          'task.created',
          newEvent.payloadJson,
          task.projectKey,
          marker,
          now,
          s.workspaceId,
          task.projectId,
          ...gate.parameters,
        ],
      ),
    );
    statements.push(
      r.prepare(`${taskSelect} WHERE t.workspaceId=? AND t.id IN (?,?) AND ${gate.sql}`, [
        s.memberId,
        s.memberId,
        s.workspaceId,
        id,
        created.id,
        ...gate.parameters,
      ]),
    );
    fitBatch(r, statements.length, 0);
    const result = await matchedBatch<TaskProjection>(r, statements);
    const final = result.at(-1);
    if (!final) throw new ApiFailure('INTERNAL_ERROR', 'Missing promotion result');
    const rows = final.results;
    return { kind: 'promoted' as const, rows, createdId: created.id };
  }
  if (
    operation === 'create' ||
    (operation === 'update' && !!requireChild(old).done !== !!child.done)
  )
    statements.push(
      gatedInsert(
        r,
        'activity',
        [
          {
            ...childEvent(
              s,
              task,
              now,
              'task.updated',
              `${operation === 'create' ? 'added' : child.done ? 'completed' : 'reopened'} subtask “${child.title}”`,
              ids,
            ),
            commandId: marker,
          },
        ],
        gate,
      ),
    );
  fitBatch(r, statements.length, 3);
  await matchedBatch(r, statements);
  return { kind: 'mutated' as const };
}
function requireChild(old: SubtaskRow | undefined): SubtaskRow {
  if (!old) throw new ApiFailure('INTERNAL_ERROR', 'Missing subtask');
  return old;
}
