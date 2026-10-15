import { EntityIdSchema, UndoResultSchema } from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import { canReadMockProject as canReadProject } from './project-access.ts';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { fail } from './primitives.ts';
import {
  getTask,
  editable,
  patchTask,
  undoLifecycle,
  touchComments,
  commentOf,
} from './task-aggregate.ts';

export async function executeTaskUndo(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
): Promise<unknown> {
  switch (id) {
    case 'undoCommand': {
      const undoId = EntityIdSchema.parse(input.undoId);
      const column = data.taskCommands.columnUndoRecords[undoId];
      if (column) {
        if (column.actorId !== data.currentMemberId)
          return fail('NOT_FOUND', 'Undo command not found');
        for (const target of [...column.parents, ...column.successors, ...column.dependencies]) {
          const task = data.tasks[target.taskId];
          if (!task || !canReadProject(data.projects[task.projectId], data))
            return fail('NOT_FOUND', 'Undo target not found');
        }
        if (column.result) return { data: column.result };
        for (const target of [...column.parents, ...column.successors, ...column.dependencies]) {
          const task = data.tasks[target.taskId]!;
          if (
            task.version !== target.postVersion ||
            data.taskCommands.deletedTasks[task.id] ||
            data.projects[task.projectId]!.archivedAt ||
            (column.kind === 'tasks.completeColumn' && task.archivedAt) ||
            (column.kind === 'tasks.archiveCompletedColumn' && !task.archivedAt)
          )
            return fail('CONFLICT', 'An Undo target changed. No tasks were restored.');
        }
        for (const child of column.successors)
          if (
            data.taskCommands.recurrenceSlots[child.sourceTaskId] !== child.taskId ||
            Object.values(data.tasks).some((task) => task.dependencyIds.includes(child.taskId))
          )
            return fail('CONFLICT', 'A recurring successor changed. No tasks were restored.');
        for (const parent of column.parents) {
          const task = data.tasks[parent.taskId]!;
          data.tasks[task.id] = {
            ...task,
            status: parent.status,
            completedAt: parent.completedAt,
            archivedAt: parent.archivedAt,
            updatedAt: parent.updatedAt,
            version: task.version + 1,
          };
          if (parent.previousStatus)
            data.taskCommands.previousStatuses[task.id] = parent.previousStatus;
          else delete data.taskCommands.previousStatuses[task.id];
        }
        for (const child of column.successors) {
          const task = data.tasks[child.taskId]!;
          data.tasks[task.id] = { ...task, version: task.version + 1 };
          data.taskCommands.deletedTasks[task.id] = clock.now();
          delete data.taskCommands.recurrenceSlots[child.sourceTaskId];
        }
        for (const target of column.dependencies)
          data.tasks[target.taskId] = {
            ...data.tasks[target.taskId]!,
            version: target.postVersion + 1,
          };
        column.activityIds.forEach((id) => {
          delete data.activity[id];
        });
        const taskIds = [...column.parents, ...column.successors, ...column.dependencies].map(
          (target) => target.taskId,
        );
        column.result = UndoResultSchema.parse({
          undoId,
          kind: column.kind,
          appliedAt: clock.now(),
          affected: {
            taskIds,
            projectIds: [...new Set(taskIds.map((id) => data.tasks[id]!.projectId))],
            memberIds: [],
            teamIds: [],
            commentIds: [],
            fileIds: [],
          },
        });
        return { data: column.result };
      }
      const commentUndo = data.taskCommands.commentUndoRecords[undoId];
      if (commentUndo) {
        if (commentUndo.actorId !== data.currentMemberId)
          return fail('NOT_FOUND', 'Undo command not found');
        const comment = commentOf(data, commentUndo.commentId, true),
          task = getTask(data, commentUndo.taskId);
        if (commentUndo.result) return { data: commentUndo.result };
        editable(data, task.id, commentUndo.taskPostVersion);
        if (
          comment.version !== commentUndo.commentPostVersion ||
          data.taskCommands.deletedComments[comment.id] !== commentUndo.deletedAt
        )
          return fail('CONFLICT', 'The deleted comment changed. Undo cannot be applied.');
        delete data.taskCommands.deletedComments[comment.id];
        data.comments[comment.id] = { ...comment, version: comment.version + 1 };
        touchComments(data, task, clock);
        commentUndo.result = UndoResultSchema.parse({
          undoId,
          kind: 'comment.delete',
          appliedAt: clock.now(),
          affected: {
            taskIds: [task.id],
            projectIds: [task.projectId],
            memberIds: [],
            teamIds: [],
            commentIds: [comment.id],
            fileIds: [],
          },
        });
        return { data: commentUndo.result };
      }
      const lifecycle = data.taskCommands.lifecycleUndoRecords[undoId];
      if (lifecycle) return { data: undoLifecycle(data, undoId, lifecycle, clock) };
      const deleted = data.taskCommands.deleteUndoRecords[undoId];
      if (deleted) {
        if (deleted.actorId !== data.currentMemberId)
          return fail('NOT_FOUND', 'Undo command not found');
        const tasks = deleted.targets.map((target) => {
          const task = data.tasks[target.taskId];
          if (!task || !canReadProject(data.projects[task.projectId], data))
            return fail('NOT_FOUND', 'Task not found');
          return task;
        });
        if (deleted.result) return { data: deleted.result };
        deleted.targets.forEach((target, index) => {
          const task = tasks[index]!;
          if (
            task.version !== target.postVersion ||
            data.taskCommands.deletedTasks[task.id] !== target.deletedAt ||
            task.archivedAt ||
            data.projects[task.projectId]!.archivedAt
          )
            return fail('CONFLICT', 'A deleted task changed. No tasks were restored.');
        });
        tasks.forEach((task) => {
          delete data.taskCommands.deletedTasks[task.id];
          data.tasks[task.id] = { ...task, version: task.version + 1 };
        });
        deleted.activityIds.forEach((id) => {
          delete data.activity[id];
        });
        deleted.result = UndoResultSchema.parse({
          undoId,
          kind: 'tasks.bulkDelete',
          appliedAt: clock.now(),
          affected: {
            taskIds: tasks.map((task) => task.id),
            projectIds: [...new Set(tasks.map((task) => task.projectId))],
            memberIds: [],
            teamIds: [],
            commentIds: [],
            fileIds: [],
          },
        });
        return { data: deleted.result };
      }
      const record = data.taskCommands.undoRecords[undoId];
      if (!record || record.actorId !== data.currentMemberId)
        return fail('NOT_FOUND', 'Undo command not found');
      const task = getTask(data, record.taskId);
      if (record.result) return { data: record.result };
      editable(data, task.id, record.postVersion);
      patchTask(
        data,
        task,
        { status: record.previousStatus === 'done' ? 'todo' : record.previousStatus },
        clock,
      );
      record.result = UndoResultSchema.parse({
        undoId,
        kind: 'task.complete',
        appliedAt: clock.now(),
        affected: {
          taskIds: [task.id],
          projectIds: [task.projectId],
          memberIds: [],
          teamIds: [],
          commentIds: [],
          fileIds: [],
        },
      });
      return { data: record.result };
    }
    default:
      throw new TypeError('Unsupported task-undo operation');
  }
}
