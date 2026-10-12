import type {
  CreateSubtaskInput,
  EntityId,
  TaskDetailDto,
  TaskMutationDto,
  UpdateSubtaskInput,
} from '@studio/contracts/api';
import { CreateSubtaskInputSchema, EntityIdSchema } from '@studio/contracts/api';
import { plainDescriptionHtml } from '@studio/domain';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { normalizeTaskDescription } from '../domain/description.ts';
import { subtaskDto, taskDto } from '../mapper.ts';
import type { SubtaskRow, TaskRow } from '../persistence/model.ts';
import { childRows } from '../persistence/reads.ts';
import { validateRelations } from '../persistence/relations.ts';
import { childSnapshotGuard } from '../persistence/snapshots.ts';
import type { SubtaskWritePlan } from '../persistence/subtasks.ts';
import { commitSubtask } from '../persistence/subtasks.ts';
import { taskDetail } from './queries.ts';
import { writableTask } from './writable-task.ts';
export type SubtaskCommand =
  | { operation: 'create'; input: CreateSubtaskInput }
  | { operation: 'update'; childId: EntityId; input: UpdateSubtaskInput }
  | { operation: 'delete' | 'promote'; childId: EntityId; input: { expectedTaskVersion: number } };

export async function mutateSubtask(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  command: SubtaskCommand,
  now: number,
  ids: IdGenerator = newId,
): Promise<TaskDetailDto | TaskMutationDto> {
  const { operation, input } = command;
  const childId = command.operation === 'create' ? undefined : command.childId;
  const task = await writableTask(r, s, id);
  if (task.version !== input.expectedTaskVersion)
    throw new ApiFailure('CONFLICT', 'Task version changed');
  const children = await childRows(r, s, id);
  const old = children.find((c) => c.id === childId);
  if (operation !== 'create' && !old) throw new ApiFailure('NOT_FOUND', 'Subtask not found');
  if (operation === 'create' && children.length >= 128)
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'A task can contain at most 128 subtasks');
  const patch = Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) => key !== 'expectedTaskVersion' && value !== undefined,
    ),
  );
  const draft = operation === 'create' ? CreateSubtaskInputSchema.parse(input) : null;
  const child: SubtaskRow = draft
    ? {
        title: draft.title,
        done: draft.done,
        assigneeId: draft.assigneeId,
        dueDate: draft.dueDate,
        note: draft.note,
        id: ids(),
        workspaceId: s.workspaceId,
        taskId: id,
        position: Math.max(-100, ...children.map((c) => c.position)) + 100,
        createdAt: now,
        updatedAt: now,
      }
    : { ...requireChild(old), ...patch, updatedAt: now };
  // Canonical fields remain text; only the promoted rich description uses HTML mapping.
  subtaskDto(child);
  let created: TaskRow | undefined;
  const marker = ids(),
    guards = [childSnapshotGuard(s, id, children)];
  if (operation === 'create' || operation === 'update')
    guards.push(
      await validateRelations(r, s, [
        {
          id,
          projectId: task.projectId,
          assigneeId: task.assigneeId,
          dependencyIds: [],
          subtaskAssigneeIds: [child.assigneeId],
        },
      ]),
    );
  if (operation === 'promote') {
    const source = requireChild(old);
    const description = normalizeTaskDescription(plainDescriptionHtml(source.note));
    created = {
      id: ids(),
      workspaceId: s.workspaceId,
      projectId: task.projectId,
      number: 0,
      title: source.title,
      descriptionHtml: description.html,
      descriptionText: description.text,
      status: source.done ? 'done' : 'todo',
      priority: task.priority,
      assigneeId: source.assigneeId ?? task.assigneeId,
      startDate: null,
      dueDate: source.dueDate,
      estimate: null,
      recurrence: null,
      position: 0,
      completedAt: source.done ? now : null,
      previousStatus: source.done ? 'todo' : null,
      recurrenceSourceTaskId: null,
      cancelledByUndoId: null,
      createdBy: s.memberId,
      createRequestId: null,
      createRequestHash: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
      lastMutationId: marker,
    };
    guards.push(
      await validateRelations(r, s, [
        {
          id: created.id,
          projectId: created.projectId,
          assigneeId: created.assigneeId,
          dependencyIds: [],
          subtaskAssigneeIds: [],
        },
      ]),
    );
  }
  const write: SubtaskWritePlan =
    operation === 'create'
      ? { kind: 'create', child }
      : operation === 'promote'
        ? { kind: 'promote', child, old: requireChild(old), created: requireCreated(created) }
        : { kind: operation, child, old: requireChild(old) };
  const result = await commitSubtask(r, s, id, task, write, marker, now, guards, ids);
  if (result.kind === 'mutated') return taskDetail(r, s, id);
  const parent = result.rows.find((t) => t.id === id),
    promoted = result.rows.find((t) => t.id === result.createdId);
  if (!parent || !promoted) throw new ApiFailure('INTERNAL_ERROR', 'Missing promotion projections');
  return {
    task: taskDto(parent),
    createdTasks: [taskDto(promoted)],
    affectedProjectIds: [EntityIdSchema.parse(task.projectId)],
    undo: null,
  };
}
function requireChild(old: SubtaskRow | undefined): SubtaskRow {
  if (!old) throw new ApiFailure('NOT_FOUND', 'Subtask not found');
  return old;
}

function requireCreated(task: TaskRow | undefined): TaskRow {
  if (!task) throw new ApiFailure('INTERNAL_ERROR', 'Missing promotion plan');
  return task;
}
