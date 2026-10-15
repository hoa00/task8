import { encodeMockCursor as encode, decodeMockCursor } from './cursor.ts';
import { CursorPayloadSchema } from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import {
  compareTaskTuple,
  taskSortValue,
  evaluateTaskView,
  normalizeTaskEvaluation,
  summarizeTasks,
} from '@studio/domain';
import { canReadMockProject as canReadProject } from './project-access.ts';
import type { Clock } from '@studio/domain';
import { StudioApiError } from '../errors.ts';
import type { MockDataset } from './dataset.ts';
import { fail, fingerprint } from './primitives.ts';
import { getTask, projectTask, detailOf } from './task-aggregate.ts';

export async function executeTaskReads(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
): Promise<unknown> {
  const taskId = typeof input.taskId === 'string' ? input.taskId : '';
  switch (id) {
    case 'getTask': {
      return { data: detailOf(data, getTask(data, taskId)) };
    }
    case 'listTasks':
    case 'getTaskSummary': {
      const query = normalizeTaskEvaluation({ query: input.query }).query,
        { cursor, limit, ...scope } = query;
      const available = Object.values(data.tasks).filter(
        (task) =>
          task.workspaceId === data.workspaceId &&
          !data.taskCommands.deletedTasks[task.id] &&
          canReadProject(data.projects[task.projectId], data) &&
          !data.projects[task.projectId]!.archivedAt,
      );
      const env = {
        today: clock.today(),
        now: Date.parse(clock.now()),
        lookups: {
          members: Object.values(data.members),
          projects: Object.values(data.projects).filter((project) => canReadProject(project, data)),
        },
      };
      const view = evaluateTaskView(
          available.map((task) => projectTask(task, data)),
          normalizeTaskEvaluation({ query }),
          env,
        ),
        tasks = view.taskIds.map((value) => data.tasks[value]!);
      if (id === 'getTaskSummary') return { data: summarizeTasks(tasks, clock.today()) };
      const queryFingerprint = await fingerprint({
        ...scope,
        operation: id,
        workspaceId: data.workspaceId,
        actorId: data.currentMemberId,
      });
      let start = 0;
      if (cursor) {
        try {
          const decoded = decodeMockCursor(cursor, CursorPayloadSchema);
          if (
            decoded.queryFingerprint !== queryFingerprint ||
            decoded.sortField !== query.sortField ||
            decoded.sortDirection !== query.sortDirection
          )
            return fail('VALIDATION_ERROR', 'Cursor belongs to a different query', 'cursor');
          const index = tasks.findIndex(
            (task) =>
              compareTaskTuple(
                { value: taskSortValue(task, query.sortField, env.lookups), id: task.id },
                { value: decoded.sortValue, id: decoded.id },
                query.sortDirection,
              ) > 0,
          );
          start = index < 0 ? tasks.length : index;
        } catch (error) {
          if (error instanceof StudioApiError) throw error;
          return fail('VALIDATION_ERROR', 'Invalid cursor', 'cursor');
        }
      }
      const items = tasks.slice(start, start + limit).map((task) => projectTask(task, data)),
        last = items.at(-1);
      return {
        data: {
          items,
          total: tasks.length,
          nextCursor:
            last && start + items.length < tasks.length
              ? encode({
                  formatVersion: 1,
                  queryFingerprint,
                  sortField: query.sortField,
                  sortDirection: query.sortDirection,
                  sortValue: taskSortValue(last, query.sortField, env.lookups),
                  id: last.id,
                })
              : null,
        },
      };
    }
    default:
      throw new TypeError('Unsupported task-reads operation');
  }
}
