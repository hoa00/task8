import {
  UpdateSubtaskInputSchema,
  EntityIdSchema,
  TaskSchema,
  SubtaskSchema,
  CreateSubtaskInputSchema,
  TaskVersionInputSchema,
} from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import { normalizeDescription, plainDescriptionHtml } from '@studio/domain';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { fail, newMockId } from './primitives.ts';
import {
  editable,
  projectTask,
  validate,
  allocateTaskKey,
  addActivity,
  detailOf,
  touchChildren,
} from './task-aggregate.ts';

export async function executeSubtasks(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
): Promise<unknown> {
  const taskId = typeof input.taskId === 'string' ? input.taskId : '';
  switch (id) {
    case 'createSubtask':
    case 'updateSubtask':
    case 'deleteSubtask':
    case 'promoteSubtask': {
      const body =
        id === 'createSubtask'
          ? CreateSubtaskInputSchema.parse(input.body)
          : id === 'updateSubtask'
            ? UpdateSubtaskInputSchema.parse(input.body)
            : TaskVersionInputSchema.parse(input.body);
      const task = editable(data, taskId, body.expectedTaskVersion);
      const existing = Object.values(data.subtasks).filter((row) => row.taskId === task.id);
      const assigneeId =
        'assigneeId' in body && body.assigneeId ? EntityIdSchema.parse(body.assigneeId) : null;
      if (
        assigneeId &&
        (!data.members[assigneeId] || data.members[assigneeId]!.workspaceId !== data.workspaceId)
      )
        return fail('VALIDATION_ERROR', 'Choose a member in this workspace', 'assigneeId');
      if (id === 'createSubtask') {
        if (existing.length >= 128)
          return fail('PAYLOAD_TOO_LARGE', 'A task can contain at most 128 subtasks');
        const draft = CreateSubtaskInputSchema.parse(body);
        const child = SubtaskSchema.parse({
          title: draft.title,
          done: draft.done,
          assigneeId: draft.assigneeId,
          dueDate: draft.dueDate,
          note: draft.note,
          id: newMockId(clock),
          taskId: task.id,
          position: Math.max(-100, ...existing.map((row) => row.position)) + 100,
        });
        data.subtasks[child.id] = child;
        addActivity(data, task, 'task.updated', clock, `added subtask “${child.title}”`);
      } else {
        const child = data.subtasks[EntityIdSchema.parse(input.subtaskId)];
        if (!child || child.taskId !== task.id) return fail('NOT_FOUND', 'Subtask not found');
        if (id === 'updateSubtask') {
          const parsed = UpdateSubtaskInputSchema.parse(body),
            patch = Object.fromEntries(
              Object.entries(parsed).filter(([key]) => key !== 'expectedTaskVersion'),
            );
          data.subtasks[child.id] = SubtaskSchema.parse({ ...child, ...patch });
          if (patch.done !== undefined && patch.done !== child.done)
            addActivity(
              data,
              task,
              'task.updated',
              clock,
              `${patch.done ? 'completed' : 'reopened'} subtask “${child.title}”`,
            );
        } else {
          if (id === 'promoteSubtask') {
            const created = TaskSchema.parse({
              ...task,
              id: newMockId(clock),
              key: allocateTaskKey(data, task.projectId),
              title: child.title,
              descriptionHtml: plainDescriptionHtml(child.note),
              status: child.done ? 'done' : 'todo',
              assigneeId: child.assigneeId ?? task.assigneeId,
              startDate: null,
              dueDate: child.dueDate,
              completedAt: child.done ? clock.now() : null,
              archivedAt: null,
              estimate: null,
              recurrence: null,
              dependencyIds: [],
              position: Math.max(0, ...Object.values(data.tasks).map((row) => row.position)) + 100,
              version: 1,
              isFavorite: false,
              attachmentCount: 0,
              commentCount: 0,
              subtaskSummary: { total: 0, completed: 0 },
              createdAt: clock.now(),
              updatedAt: clock.now(),
            });
            validate(created, data, true);
            data.tasks[created.id] = created;
            data.taskCommands.descriptionTexts[created.id] = normalizeDescription(
              created.descriptionHtml,
            ).text;
            delete data.subtasks[child.id];
            touchChildren(data, task, clock);
            addActivity(
              data,
              task,
              'task.updated',
              clock,
              `converted a subtask into ${created.key}`,
            );
            addActivity(data, created, 'task.created', clock);
            return {
              data: {
                task: projectTask(data.tasks[task.id]!, data),
                createdTasks: [projectTask(created, data)],
                affectedProjectIds: [task.projectId],
                undo: null,
              },
            };
          }
          delete data.subtasks[child.id];
        }
      }
      touchChildren(data, task, clock);
      return { data: detailOf(data, data.tasks[task.id]!) };
    }
    default:
      throw new TypeError('Unsupported subtasks operation');
  }
}
