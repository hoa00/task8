import {
  BulkMutateTasksInputSchema,
  CreateTaskInputSchema,
  ActivitySchema,
  EntityIdSchema,
  MoveTaskInputSchema,
  SetTaskCompletionInputSchema,
  TaskSchema,
  UpdateTaskInputSchema,
  SubtaskSchema,
  DuplicateTaskInputSchema,
  VersionInputSchema,
  priorities,
} from '@studio/contracts/api';
import type { OperationId, TaskDto } from '@studio/contracts/api';
import { evaluateTaskView, normalizeTaskEvaluation, normalizeDescription } from '@studio/domain';
import { canReadMockProject as canReadProject } from './project-access.ts';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { fail, newMockId, fingerprint } from './primitives.ts';
import {
  getTask,
  editable,
  projectTask,
  validate,
  allocateTaskKey,
  definedPatch,
  patchTask,
  addActivity,
} from './task-aggregate.ts';

export async function executeTaskCommands(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
): Promise<unknown> {
  const taskId = typeof input.taskId === 'string' ? input.taskId : '';
  switch (id) {
    case 'createTask': {
      const body = CreateTaskInputSchema.parse(input.body);
      const normalized = normalizeDescription(body.descriptionHtml);
      body.descriptionHtml = normalized.html;
      for (const child of body.subtasks)
        if (
          child.assigneeId &&
          (!data.members[child.assigneeId] ||
            data.members[child.assigneeId]!.workspaceId !== data.workspaceId)
        )
          return fail('VALIDATION_ERROR', 'Choose a member in this workspace', 'subtasks');
      const { clientRequestId: requestId, ...intent } = body;
      const signature = await fingerprint({
          ...intent,
          labelIds: [...body.labelIds].sort(),
          dependencyIds: [...body.dependencyIds].sort(),
        }),
        prior = data.taskCommands.createRequests[data.currentMemberId]?.[requestId];
      if (prior) {
        if (prior.fingerprint !== signature)
          return fail('CONFLICT', 'Create request ID was reused with different values');
        const task = getTask(data, prior.taskId);
        if (task.projectId !== body.projectId || task.archivedAt)
          return fail('CONFLICT', 'Created task moved scope or lifecycle changed');
        return {
          data: {
            task: projectTask(task, data),
            createdTasks: [],
            affectedProjectIds: [task.projectId],
            undo: null,
          },
        };
      }
      const fields = Object.fromEntries(
        Object.entries(body).filter(([key]) => !['clientRequestId', 'subtasks'].includes(key)),
      );
      const task = TaskSchema.parse({
        ...fields,
        id: newMockId(clock),
        workspaceId: data.workspaceId,
        key: 'NEW-0',
        createdAt: clock.now(),
        updatedAt: clock.now(),
        completedAt: body.status === 'done' ? clock.now() : null,
        archivedAt: null,
        position: Math.max(0, ...Object.values(data.tasks).map((row) => row.position)) + 100,
        version: 1,
        isFavorite: false,
        attachmentCount: 0,
        commentCount: 0,
        subtaskSummary: {
          total: body.subtasks.length,
          completed: body.subtasks.filter((row) => row.done).length,
        },
      });
      validate(task, data, true);
      task.key = allocateTaskKey(data, task.projectId);
      data.tasks[task.id] = task;
      data.taskCommands.descriptionTexts[task.id] = normalized.text;
      body.subtasks.forEach((draft, index) => {
        const row = SubtaskSchema.parse({
          ...draft,
          id: newMockId(clock),
          taskId: task.id,
          position: index * 100,
        });
        data.subtasks[row.id] = row;
      });
      for (const targetId of task.dependencyIds)
        data.tasks[targetId] = {
          ...data.tasks[targetId]!,
          version: data.tasks[targetId]!.version + 1,
        };
      const event = ActivitySchema.parse({
        id: newMockId(clock),
        actorId: data.currentMemberId,
        eventType: 'task.created',
        taskId: task.id,
        projectId: task.projectId,
        createdAt: clock.now(),
        payload: { taskKey: task.key, taskTitle: task.title },
      });
      data.activity[event.id] = event;
      const requests = data.taskCommands.createRequests[data.currentMemberId] ?? {};
      requests[body.clientRequestId] = { fingerprint: signature, taskId: task.id };
      data.taskCommands.createRequests[data.currentMemberId] = requests;
      return {
        data: {
          task: projectTask(task, data),
          createdTasks: [],
          affectedProjectIds: [task.projectId],
          undo: null,
        },
      };
    }
    case 'duplicateTask': {
      const body = DuplicateTaskInputSchema.parse(input.body),
        original = editable(data, taskId, body.expectedVersion);
      const task = TaskSchema.parse({
        ...original,
        id: newMockId(clock),
        key: allocateTaskKey(data, original.projectId),
        title: body.title ?? `${original.title} (copy)`,
        status: 'todo',
        completedAt: null,
        archivedAt: null,
        version: 1,
        isFavorite: false,
        attachmentCount: 0,
        commentCount: 0,
        createdAt: clock.now(),
        updatedAt: clock.now(),
        position: Math.max(0, ...Object.values(data.tasks).map((row) => row.position)) + 100,
        dependencyIds: projectTask(original, data).dependencyIds,
        subtaskSummary: { ...original.subtaskSummary, completed: 0 },
      });
      validate(task, data, true);
      data.tasks[task.id] = task;
      data.taskCommands.descriptionTexts[task.id] = normalizeDescription(task.descriptionHtml).text;
      Object.values(data.subtasks)
        .filter((row) => row.taskId === original.id)
        .forEach((row) => {
          const child = { ...row, id: newMockId(clock), taskId: task.id, done: false };
          data.subtasks[child.id] = child;
        });
      task.dependencyIds.forEach((id) => {
        data.tasks[id] = { ...data.tasks[id]!, version: data.tasks[id]!.version + 1 };
      });
      addActivity(data, task, 'task.created', clock);
      return {
        data: {
          task: projectTask(task, data),
          createdTasks: [],
          affectedProjectIds: [task.projectId],
          undo: null,
        },
      };
    }
    case 'addTaskFavorite':
    case 'removeTaskFavorite': {
      const task = getTask(data, taskId),
        favorites = new Set(data.taskCommands.taskFavorites[data.currentMemberId] ?? []),
        before = favorites.has(task.id);
      if (id === 'addTaskFavorite') favorites.add(task.id);
      else favorites.delete(task.id);
      data.taskCommands.taskFavorites[data.currentMemberId] = [...favorites];
      if (before !== favorites.has(task.id))
        data.tasks[task.id] = { ...task, version: task.version + 1 };
      return { data: { taskId: task.id, isFavorite: favorites.has(task.id) } };
    }
    case 'restoreTask': {
      const body = VersionInputSchema.parse(input.body),
        task = getTask(data, taskId);
      if (
        task.version !== body.expectedVersion ||
        !task.archivedAt ||
        data.projects[task.projectId]!.archivedAt
      )
        return fail('CONFLICT', 'The task or parent lifecycle changed. Refresh and try again.');
      const next = { ...task, archivedAt: null, updatedAt: clock.now(), version: task.version + 1 };
      data.tasks[task.id] = next;
      addActivity(data, next, 'task.updated', clock, 'Restored from archive');
      return {
        data: {
          task: projectTask(next, data),
          createdTasks: [],
          affectedProjectIds: [task.projectId],
          undo: null,
        },
      };
    }
    case 'archiveTask':
    case 'deleteTask': {
      const body = VersionInputSchema.parse(input.body),
        task =
          id === 'deleteTask'
            ? getTask(data, taskId)
            : editable(data, taskId, body.expectedVersion),
        lifecycleAt = clock.now();
      if (task.version !== body.expectedVersion || data.projects[task.projectId]!.archivedAt)
        return fail('CONFLICT', 'The task or parent lifecycle changed. Refresh and try again.');
      const next = {
        ...task,
        version: task.version + 1,
        updatedAt: lifecycleAt,
        ...(id === 'archiveTask' ? { archivedAt: lifecycleAt } : {}),
      };
      data.tasks[task.id] = next;
      if (id === 'deleteTask') data.taskCommands.deletedTasks[task.id] = lifecycleAt;
      const activity = addActivity(
          data,
          next,
          id === 'archiveTask' ? 'task.archived' : 'task.deleted',
          clock,
        ),
        undoId = newMockId(clock);
      data.taskCommands.lifecycleUndoRecords[undoId] = {
        actorId: data.currentMemberId,
        kind: id === 'archiveTask' ? 'task.archive' : 'task.delete',
        entityId: task.id,
        postVersion: next.version,
        lifecycleAt,
        previousArchivedAt: task.archivedAt,
        taskId: null,
        taskPostVersion: null,
        activityIds: [activity],
        result: null,
      };
      return {
        data: {
          task: projectTask(next, data),
          createdTasks: [],
          affectedProjectIds: [task.projectId],
          undo: { id: undoId, kind: id === 'archiveTask' ? 'task.archive' : 'task.delete' },
        },
      };
    }
    case 'bulkMutateTasks': {
      const body = BulkMutateTasksInputSchema.parse(input.body);
      if (
        body.operation === 'complete' ||
        body.operation === 'archive' ||
        body.operation === 'sortPriority'
      ) {
        const scope = body.columnScope;
        if (
          scope.kind === 'project' &&
          (!canReadProject(data.projects[scope.projectId], data) ||
            data.projects[scope.projectId]!.archivedAt)
        )
          return fail('NOT_FOUND', 'Column project not found');
        const full = Object.values(data.tasks).filter(
          (task) =>
            task.workspaceId === data.workspaceId &&
            task.status === scope.status &&
            !task.archivedAt &&
            !data.taskCommands.deletedTasks[task.id] &&
            !data.projects[task.projectId]?.archivedAt &&
            canReadProject(data.projects[task.projectId], data) &&
            (scope.kind === 'workspace' || task.projectId === scope.projectId),
        );
        if (full.length > 20)
          return fail(
            'PAYLOAD_TOO_LARGE',
            'A column command supports at most 20 tasks. No tasks were changed.',
          );
        if (
          full.length !== body.items.length ||
          full.some((task) => !body.items.some((item) => item.id === task.id))
        )
          return fail(
            'CONFLICT',
            'The column changed. Refresh and try again. No tasks were changed.',
          );
        const originals = body.items.map((item) => editable(data, item.id, item.expectedVersion));
        if (body.operation === 'sortPriority') {
          const weight = (task: TaskDto) =>
            priorities.find((priority) => priority.id === task.priority)!.weight;
          const sorted = [...originals].sort(
              (a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id),
            ),
            base = originals.length ? Math.min(...originals.map((task) => task.position)) : 0;
          sorted.forEach((task, index) => {
            data.tasks[task.id] = {
              ...task,
              position: base + index * 100,
              updatedAt: clock.now(),
              version: task.version + 1,
            };
          });
          return {
            data: {
              tasks: sorted.map((task) => projectTask(data.tasks[task.id]!, data)),
              createdTasks: [],
              affectedProjectIds: [...new Set(sorted.map((task) => task.projectId))],
              undo: null,
            },
          };
        }
        if (!originals.length && body.operation === 'complete')
          return { data: { tasks: [], createdTasks: [], affectedProjectIds: [], undo: null } };
        const undoId = newMockId(clock),
          beforeActivity = new Set(Object.keys(data.activity));
        const parents = originals.map((task) => ({
          taskId: task.id,
          postVersion: task.version,
          status: task.status,
          completedAt: task.completedAt,
          archivedAt: task.archivedAt,
          updatedAt: task.updatedAt,
          previousStatus: data.taskCommands.previousStatuses[task.id] ?? null,
        }));
        const createdTasks: TaskDto[] = [],
          successors: MockDataset['taskCommands']['columnUndoRecords'][TaskDto['id']]['successors'] =
            [];
        for (const original of originals) {
          if (body.operation === 'complete') {
            const result = patchTask(data, data.tasks[original.id]!, { status: 'done' }, clock);
            createdTasks.push(...result.createdTasks);
            successors.push(
              ...result.createdTasks.map((task) => ({
                taskId: task.id,
                sourceTaskId: original.id,
                postVersion: task.version,
              })),
            );
          } else {
            const next = {
              ...original,
              archivedAt: clock.now(),
              updatedAt: clock.now(),
              version: original.version + 1,
            };
            data.tasks[original.id] = next;
            addActivity(data, next, 'task.archived', clock);
          }
        }
        parents.forEach((parent) => {
          parent.postVersion = data.tasks[parent.taskId]!.version;
        });
        successors.forEach((child) => {
          child.postVersion = data.tasks[child.taskId]!.version;
        });
        const dependencies = [...new Set(createdTasks.flatMap((task) => task.dependencyIds))]
          .filter(
            (id) =>
              !parents.some((parent) => parent.taskId === id) &&
              !successors.some((child) => child.taskId === id),
          )
          .map((taskId) => ({ taskId, postVersion: data.tasks[taskId]!.version }));
        const record = {
          actorId: data.currentMemberId,
          kind:
            body.operation === 'complete'
              ? ('tasks.completeColumn' as const)
              : ('tasks.archiveCompletedColumn' as const),
          parents,
          successors,
          dependencies,
          activityIds: Object.values(data.activity)
            .filter((event) => !beforeActivity.has(event.id))
            .map((event) => event.id),
          result: null,
        };
        if (
          parents.length + successors.length + dependencies.length > 128 ||
          new TextEncoder().encode(JSON.stringify(record)).length > 65536
        )
          return fail(
            'PAYLOAD_TOO_LARGE',
            'The bounded Undo record is too large. No tasks were changed.',
          );
        data.taskCommands.columnUndoRecords[undoId] = record;
        return {
          data: {
            tasks: originals.map((task) => projectTask(data.tasks[task.id]!, data)),
            createdTasks: createdTasks.map((task) => projectTask(data.tasks[task.id]!, data)),
            affectedProjectIds: [...new Set(originals.map((task) => task.projectId))],
            undo: { id: undoId, kind: record.kind },
          },
        };
      }
      const originals = body.items.map((item) => editable(data, item.id, item.expectedVersion));
      if (body.operation === 'patch') {
        // Validate every prospective aggregate before transition/recurrence writes.
        for (const task of originals)
          validate(
            {
              ...task,
              ...definedPatch(body.patch),
              completedAt: body.patch.status
                ? body.patch.status === 'done'
                  ? clock.now()
                  : null
                : task.completedAt,
            },
            data,
          );
        const results = originals.map((task) =>
          patchTask(data, data.tasks[task.id]!, definedPatch(body.patch), clock),
        );
        return {
          data: {
            tasks: results.map((row) => projectTask(data.tasks[row.task.id]!, data)),
            createdTasks: results
              .flatMap((row) => row.createdTasks)
              .map((task) => projectTask(data.tasks[task.id]!, data)),
            affectedProjectIds: [...new Set(results.flatMap((row) => row.affectedProjectIds))],
            undo: null,
          },
        };
      }
      const undoId = newMockId(clock),
        deletedAt = clock.now(),
        activityIds: TaskDto['id'][] = [];
      const tasks = originals.map((task) => {
        const next = { ...task, version: task.version + 1, updatedAt: clock.now() };
        data.tasks[task.id] = next;
        data.taskCommands.deletedTasks[task.id] = deletedAt;
        const event = ActivitySchema.parse({
          id: newMockId(clock),
          actorId: data.currentMemberId,
          eventType: 'task.deleted',
          taskId: task.id,
          projectId: task.projectId,
          createdAt: clock.now(),
          payload: { taskKey: task.key, taskTitle: task.title },
        });
        data.activity[event.id] = event;
        activityIds.push(event.id);
        return next;
      });
      data.taskCommands.deleteUndoRecords[undoId] = {
        actorId: data.currentMemberId,
        targets: tasks.map((task) => ({ taskId: task.id, postVersion: task.version, deletedAt })),
        activityIds,
        result: null,
      };
      return {
        data: {
          tasks: tasks.map((task) => projectTask(task, data)),
          createdTasks: [],
          affectedProjectIds: [...new Set(tasks.map((task) => task.projectId))],
          undo: { id: undoId, kind: 'tasks.bulkDelete' },
        },
      };
    }
    case 'updateTask': {
      const { expectedVersion, ...patch } = UpdateTaskInputSchema.parse(input.body);
      if (patch.descriptionHtml !== undefined)
        patch.descriptionHtml = normalizeDescription(patch.descriptionHtml).html;
      const task = editable(data, taskId, expectedVersion);
      return { data: patchTask(data, task, definedPatch(patch), clock) };
    }
    case 'moveTask': {
      const body = MoveTaskInputSchema.parse(input.body),
        task = editable(data, taskId, body.expectedVersion);
      const projectId = body.targetProjectId ?? task.projectId;
      const groupPatch = definedPatch(body.groupPatch ?? {});
      const prospective = { ...task, ...groupPatch, projectId };
      validate(
        prospective.status !== task.status
          ? { ...prospective, completedAt: prospective.status === 'done' ? clock.now() : null }
          : prospective,
        data,
      );
      const env = {
        today: clock.today(),
        now: Date.parse(clock.now()),
        lookups: { members: Object.values(data.members), projects: Object.values(data.projects) },
      };
      const { groupBy, groupKey, ...scope } = body.scope;
      const destination = evaluateTaskView(
        Object.values(data.tasks).filter(
          (row) =>
            row.id !== task.id &&
            !data.taskCommands.deletedTasks[row.id] &&
            !row.archivedAt &&
            !data.projects[row.projectId]?.archivedAt &&
            canReadProject(data.projects[row.projectId], data),
        ),
        normalizeTaskEvaluation({
          query: {
            ...scope,
            ...(body.targetProjectId ? { projectId } : {}),
            sortField: 'manual',
            sortDirection: 'asc',
          },
          groupBy: groupBy ?? 'none',
        }),
        env,
      );
      const ids =
        groupBy && groupKey !== undefined
          ? (destination.groups.find((group) => group.key === (groupKey ?? 'none'))?.taskIds ?? [])
          : destination.taskIds;
      const prospectiveView = evaluateTaskView(
        [
          prospective.status !== task.status
            ? { ...prospective, completedAt: prospective.status === 'done' ? clock.now() : null }
            : prospective,
        ],
        normalizeTaskEvaluation({
          query: {
            ...scope,
            ...(body.targetProjectId ? { projectId } : {}),
            sortField: 'manual',
            sortDirection: 'asc',
          },
          groupBy: groupBy ?? 'none',
        }),
        env,
      );
      if (
        !prospectiveView.taskIds.includes(task.id) ||
        (groupBy &&
          groupKey !== undefined &&
          !prospectiveView.groups.some(
            (group) => group.key === (groupKey ?? 'none') && group.taskIds.includes(task.id),
          ))
      )
        return fail('VALIDATION_ERROR', 'Moved task is outside the destination scope or group');
      const before = body.beforeId ? data.tasks[body.beforeId] : null,
        after = body.afterId ? data.tasks[body.afterId] : null;
      for (const neighbor of [body.beforeId, body.afterId])
        if (neighbor && !ids.includes(EntityIdSchema.parse(neighbor)))
          return fail('VALIDATION_ERROR', 'Move neighbor is outside the destination scope');
      if (before && after && after.position >= before.position)
        return fail('VALIDATION_ERROR', 'Move neighbors are not ordered');
      let position =
        before && after
          ? Math.floor((before.position + after.position) / 2)
          : before
            ? before.position - 100
            : after
              ? after.position + 100
              : Math.max(0, ...ids.map((value) => data.tasks[value]!.position)) + 100;
      if (before && after && position === after.position) {
        if (ids.length + 1 > 128)
          return fail('VIEW_SCOPE_TOO_LARGE', 'Ordering scope exceeds bounded rebalance');
        const ordered = ids
            .map((id) => data.tasks[id]!)
            .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
          at = ordered.findIndex((row) => row.id === before.id);
        ordered.splice(at, 0, task);
        const base = Math.min(...ordered.map((row) => row.position));
        ordered.forEach((row, index) => {
          const nextPosition = base + index * 100;
          if (!Number.isSafeInteger(nextPosition))
            return fail('VIEW_SCOPE_TOO_LARGE', 'Ordering exceeds integer range');
          if (row.id === task.id) {
            position = nextPosition;
            return;
          }
          if (row.position !== nextPosition)
            data.tasks[row.id] = {
              ...row,
              position: nextPosition,
              version: row.version + 1,
              updatedAt: clock.now(),
            };
        });
      }
      const key = projectId === task.projectId ? task.key : allocateTaskKey(data, projectId);
      const result = patchTask(data, task, { ...groupPatch, projectId, key, position }, clock);
      if (projectId !== task.projectId)
        Object.values(data.files)
          .filter((file) => file.taskId === task.id)
          .forEach((file) => {
            file.projectId = projectId;
            file.version++;
          });
      return { data: result };
    }
    case 'setTaskCompletion': {
      const body = SetTaskCompletionInputSchema.parse(input.body),
        task = editable(data, taskId, body.expectedVersion);
      if ((task.status === 'done') === body.completed)
        return {
          data: {
            task: projectTask(task, data),
            createdTasks: [],
            affectedProjectIds: [task.projectId],
            undo: null,
          },
        };
      const status = body.completed
        ? 'done'
        : (data.taskCommands.previousStatuses[task.id] ?? 'todo');
      const result = patchTask(
        data,
        task,
        { status: status === 'done' && !body.completed ? 'todo' : status },
        clock,
      );
      if (body.completed) {
        const undoId = newMockId(clock);
        data.taskCommands.undoRecords[undoId] = {
          taskId: task.id,
          actorId: data.currentMemberId,
          postVersion: result.task.version,
          previousStatus: task.status,
          result: null,
        };
        result.undo = { id: undoId, kind: 'task.complete' };
      }
      return { data: result };
    }
    default:
      throw new TypeError('Unsupported task-commands operation');
  }
}
