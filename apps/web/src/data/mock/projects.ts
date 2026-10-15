import { encodeMockCursor, decodeMockCursor, idCursorSchema } from './cursor.ts';
import {
  ActivitySchema,
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  DuplicateProjectInputSchema,
  ProjectSchema,
  TaskSchema,
  SubtaskSchema,
  SavedViewSchema,
  CreateSavedViewInputSchema,
  UpdateSavedViewInputSchema,
  ProjectQuerySchema,
  EntityIdSchema,
  VersionInputSchema,
  UpdateProjectOrderInputSchema,
  UndoResultSchema,
  catalogs,
} from '@studio/contracts/api';
import type { OperationId, ProjectDto, ProjectMutationDto, TaskDto } from '@studio/contracts/api';
import { addDateDays, canReadProject, summarizeTasks } from '@studio/domain';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { projectCatalogItem } from './reads.ts';
import { newMockId, fingerprint } from './task-fields.ts';
import { canReadMockProject } from './project-access.ts';
import { transactMock } from './transaction.ts';
import { StudioApiError } from '../errors.ts';
export const projectOperations = [
  'listProjects',
  'createProject',
  'getProject',
  'updateProject',
  'duplicateProject',
  'archiveProject',
  'restoreProject',
  'deleteProject',
  'restoreDeletedProject',
  'listProjectMembers',
  'getProjectSummary',
  'listSavedViews',
  'createSavedView',
  'updateSavedView',
  'deleteSavedView',
  'addProjectFavorite',
  'removeProjectFavorite',
  'updateProjectOrder',
] as const satisfies readonly OperationId[];
function fail(
  code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR',
  message: string,
): never {
  throw new StudioApiError({ error: { code, message } });
}
function projectOf(data: MockDataset, id: unknown, detail = false, deleted = false): ProjectDto {
  const project = data.projects[EntityIdSchema.parse(id)];
  if (!project || (!deleted && data.projectCommands.deletedProjects[project.id]))
    return fail('NOT_FOUND', 'Project not found');
  if (!canReadProject(project, data))
    return fail(
      detail ? 'FORBIDDEN' : 'NOT_FOUND',
      detail ? 'This project is private' : 'Project not found',
    );
  return project;
}
function editable(data: MockDataset, id: unknown, version: number, deleted = false) {
  const project = projectOf(data, id, false, deleted);
  if (project.version !== version)
    return fail('CONFLICT', 'This project changed. Refresh and try again.');
  return project;
}
function validate(project: ProjectDto, data: MockDataset) {
  if (!data.members[project.leadId] || data.members[project.leadId]!.status !== 'active')
    return fail('VALIDATION_ERROR', 'Choose an active project lead');
  if (
    project.teamId &&
    (!data.teams[project.teamId] ||
      data.teamCommands.deletedTeams[project.teamId] ||
      data.teams[project.teamId]!.workspaceId !== data.workspaceId)
  )
    return fail('VALIDATION_ERROR', 'Choose an active team in this workspace');
  return ProjectSchema.parse(project);
}
function keyFor(name: string, data: MockDataset) {
  let key = name
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  if (key.length < 2)
    key =
      name
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'PRJ';
  while (Object.values(data.projects).some((project) => project.key === key)) key += 'X';
  return key;
}
function activeTasks(data: MockDataset, id: string) {
  return Object.values(data.tasks).filter(
    (task) => task.projectId === id && !task.archivedAt && !data.taskCommands.deletedTasks[task.id],
  );
}
function activity(
  data: MockDataset,
  project: ProjectDto,
  eventType: 'project.created' | 'project.updated' | 'project.archived' | 'project.deleted',
  clock: Clock,
) {
  const id = newMockId(clock);
  data.activity[id] = ActivitySchema.parse({
    id,
    actorId: data.currentMemberId,
    projectId: project.id,
    taskId: null,
    eventType,
    createdAt: clock.now(),
    payload: { projectName: project.name },
  });
  return id;
}
function taskCreated(data: MockDataset, task: TaskDto, clock: Clock) {
  const id = newMockId(clock);
  data.activity[id] = ActivitySchema.parse({
    id,
    actorId: data.currentMemberId,
    projectId: task.projectId,
    taskId: task.id,
    eventType: 'task.created',
    createdAt: clock.now(),
    payload: {
      taskKey: task.key,
      taskTitle: task.title,
      projectName: data.projects[task.projectId]!.name,
    },
  });
}
function mutation(
  project: ProjectDto,
  data: MockDataset,
  createdTasks: TaskDto[] = [],
): ProjectMutationDto {
  return {
    project: {
      ...project,
      isFavorite: (data.projectCommands.favorites[data.currentMemberId] ?? []).includes(project.id),
    },
    createdTasks,
    affectedProjectIds: [project.id],
    taskIdMap: [],
    undo: null,
  };
}
function create(
  data: MockDataset,
  body: ReturnType<typeof CreateProjectInputSchema.parse>,
  clock: Clock,
) {
  if (data.members[data.currentMemberId]!.role === 'Guest')
    return fail('FORBIDDEN', 'Guests cannot create projects');
  const id = newMockId(clock),
    now = clock.now();
  const project = validate(
    ProjectSchema.parse({
      id,
      workspaceId: data.workspaceId,
      key: keyFor(body.name, data),
      name: body.name,
      description: body.description || 'No description yet.',
      icon: body.icon,
      color: body.color,
      status: 'planning',
      teamId: body.teamId,
      leadId: body.leadId,
      startDate: clock.today(),
      dueDate: body.dueDate,
      visibility: 'workspace',
      memberIds: [...new Set([data.currentMemberId, body.leadId])],
      milestones: [],
      isFavorite: false,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      version: 1,
    }),
    data,
  );
  data.projects[id] = project;
  data.projectOrder.unshift(id);
  for (const order of Object.values(data.projectCommands.orders)) order.unshift(id);
  activity(data, project, 'project.created', clock);
  return project;
}
async function execute(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
): Promise<unknown> {
  switch (id) {
    case 'getProject': {
      const project = projectOf(data, input.projectId, true);
      return { data: mutation(project, data).project };
    }
    case 'getProjectSummary': {
      const project = projectOf(data, input.projectId);
      const taskSummary = summarizeTasks(activeTasks(data, project.id), clock.today());
      return { data: { projectId: project.id, taskSummary, progress: taskSummary.completionRate } };
    }
    case 'listProjectMembers': {
      const project = projectOf(data, input.projectId);
      return {
        data: project.memberIds.map((memberId) => ({
          member: data.members[memberId]!,
          permission: 'edit',
        })),
      };
    }
    case 'listProjects': {
      const query = ProjectQuerySchema.parse(input.query),
        q = query.q.toLowerCase();
      const rows = Object.values(data.projects)
        .filter(
          (project) =>
            !data.projectCommands.deletedProjects[project.id] &&
            !!project.archivedAt === query.archived &&
            (!query.status || project.status === query.status) &&
            (!q ||
              project.name.toLowerCase().includes(q) ||
              project.description.toLowerCase().includes(q)),
        )
        .map((project) => projectCatalogItem(data, project, clock));
      const value = (row: (typeof rows)[number]): string | number =>
        query.sort === 'name'
          ? row.project.name
          : query.sort === 'due'
            ? (row.project.dueDate ?? '9999')
            : query.sort === 'progress'
              ? row.access === 'allowed'
                ? -row.summary.progress
                : 0
              : row.access === 'allowed'
                ? row.project.lastActivityAt
                : '';
      // Source recent means p.last ascending (newest instant first); stable IDs
      // provide deterministic canonical ties. Restricted rows disclose no times.
      const compare = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
        const av = value(a),
          bv = value(b),
          direction = query.sort === 'recent' ? -1 : 1;
        return (
          (av < bv ? -direction : av > bv ? direction : 0) ||
          a.project.id.localeCompare(b.project.id)
        );
      };
      rows.sort(compare);
      const scope = Object.fromEntries(
        Object.entries(query).filter(([key]) => !['cursor', 'limit'].includes(key)),
      );
      const signature = await fingerprint({
        ...scope,
        operation: 'listProjects',
        workspaceId: data.workspaceId,
        memberId: data.currentMemberId,
      });
      let start = 0;
      if (query.cursor) {
        try {
          const anchor = decodeMockCursor(query.cursor, idCursorSchema);
          if (anchor.signature !== signature)
            return fail('VALIDATION_ERROR', 'Cursor belongs to a different project query');
          const index = rows.findIndex((row) => row.project.id === anchor.id);
          if (index < 0) return fail('VALIDATION_ERROR', 'Project cursor is no longer valid');
          start = index + 1;
        } catch {
          return fail('VALIDATION_ERROR', 'Invalid project cursor');
        }
      }
      const items = rows.slice(start, start + query.limit);
      return {
        data: {
          items,
          total: rows.length,
          nextCursor:
            start + items.length < rows.length
              ? encodeMockCursor({ signature, id: items.at(-1)!.project.id })
              : null,
        },
      };
    }
    case 'createProject': {
      const body = CreateProjectInputSchema.parse(input.body),
        project = create(data, body, clock);
      const tasks = catalogs.templates
        .find((template) => template.id === body.templateId)!
        .tasks.map((title, index) => {
          const id = newMockId(clock);
          const task = TaskSchema.parse({
            id,
            workspaceId: data.workspaceId,
            projectId: project.id,
            key: `${project.key}-${201 + index}`,
            title,
            descriptionHtml: '',
            status: index === 0 ? 'todo' : 'backlog',
            assigneeId: index === 0 ? data.currentMemberId : null,
            priority: index === 0 ? 'high' : 'medium',
            startDate: addDateDays(clock.today(), index * 5),
            dueDate: addDateDays(clock.today(), 5 + index * 5),
            estimate: null,
            recurrence: null,
            labelIds: [],
            dependencyIds: [],
            position: Math.max(-100, ...Object.values(data.tasks).map((row) => row.position)) + 100,
            completedAt: null,
            archivedAt: null,
            createdAt: clock.now(),
            updatedAt: clock.now(),
            version: 1,
            isFavorite: false,
            subtaskSummary: { total: 0, completed: 0 },
            attachmentCount: 0,
            commentCount: 0,
          });
          data.taskCommands.projectSequences[project.id] = 201 + index;
          data.tasks[id] = task;
          taskCreated(data, task, clock);
          data.taskCommands.descriptionTexts[id] = '';
          return task;
        });
      return { data: mutation(project, data, tasks) };
    }
    case 'updateProject': {
      const { expectedVersion, ...patch } = UpdateProjectInputSchema.parse(input.body),
        project = editable(data, input.projectId, expectedVersion);
      if (project.archivedAt) return fail('CONFLICT', 'Restore the project before editing');
      const next = validate(
        ProjectSchema.parse({
          ...project,
          ...patch,
          memberIds: project.memberIds,
          version: project.version + 1,
          updatedAt: clock.now(),
          lastActivityAt: clock.now(),
        }),
        data,
      );
      data.projects[next.id] = next;
      activity(data, next, 'project.updated', clock);
      return { data: mutation(next, data) };
    }
    case 'duplicateProject': {
      const body = DuplicateProjectInputSchema.parse(input.body),
        original = editable(data, input.projectId, body.expectedVersion);
      if (original.archivedAt) return fail('CONFLICT', 'Restore the project before duplicating');
      const project = create(
        data,
        {
          name: body.name,
          description: original.description,
          color: original.color,
          icon: original.icon,
          teamId: original.teamId,
          leadId: original.leadId,
          dueDate: original.dueDate,
          templateId: 'blank',
        },
        clock,
      );
      const originals = activeTasks(data, original.id),
        map = new Map(originals.map((task) => [task.id, newMockId(clock)]));
      const tasks = originals.map((task, index) => {
        const taskId = map.get(task.id)!;
        const subtasks = Object.values(data.subtasks)
          .filter((child) => child.taskId === task.id)
          .map((child) =>
            SubtaskSchema.parse({ ...child, id: newMockId(clock), taskId, done: false }),
          );
        for (const child of subtasks) data.subtasks[child.id] = child;
        const next = TaskSchema.parse({
          ...task,
          id: taskId,
          projectId: project.id,
          key: `${project.key}-${201 + index}`,
          status: 'todo',
          position: Math.max(-100, ...Object.values(data.tasks).map((row) => row.position)) + 100,
          completedAt: null,
          archivedAt: null,
          createdAt: clock.now(),
          updatedAt: clock.now(),
          version: 1,
          isFavorite: false,
          dependencyIds: task.dependencyIds.flatMap((id) => (map.get(id) ? [map.get(id)!] : [])),
          subtaskSummary: { total: subtasks.length, completed: 0 },
          attachmentCount: 0,
          commentCount: 0,
        });
        data.taskCommands.projectSequences[project.id] = 201 + index;
        data.tasks[next.id] = next;
        taskCreated(data, next, clock);
        data.taskCommands.descriptionTexts[next.id] =
          data.taskCommands.descriptionTexts[task.id] ?? '';
        return next;
      });
      return {
        data: {
          ...mutation(project, data, tasks),
          taskIdMap: [...map].map(([sourceTaskId, targetTaskId]) => ({
            sourceTaskId,
            targetTaskId,
          })),
        },
      };
    }
    case 'archiveProject':
    case 'deleteProject':
    case 'restoreProject':
    case 'restoreDeletedProject': {
      const { expectedVersion } = VersionInputSchema.parse(input.body),
        project = editable(data, input.projectId, expectedVersion, id === 'restoreDeletedProject');
      const now = clock.now();
      if (
        id === 'restoreDeletedProject' &&
        data.projectCommands.deletedBy[project.id] !== data.currentMemberId
      )
        return fail('FORBIDDEN', 'Only the deleting member can restore this project');
      if (
        (id === 'restoreProject' && !project.archivedAt) ||
        (id === 'restoreDeletedProject' && !data.projectCommands.deletedProjects[project.id]) ||
        (id === 'archiveProject' && !!project.archivedAt)
      )
        return fail('CONFLICT', 'Project lifecycle already changed');
      const next = {
        ...project,
        archivedAt:
          id === 'archiveProject' ? now : id === 'restoreProject' ? null : project.archivedAt,
        version: project.version + 1,
        updatedAt: now,
      };
      data.projects[next.id] = next;
      if (id === 'restoreDeletedProject') {
        delete data.projectCommands.deletedProjects[next.id];
        delete data.projectCommands.deletedBy[next.id];
      }
      if (id === 'deleteProject') {
        data.projectCommands.deletedProjects[next.id] = now;
        data.projectCommands.deletedBy[next.id] = data.currentMemberId;
      }
      const result = mutation(next, data);
      if (id === 'archiveProject' || id === 'deleteProject') {
        const undoId = newMockId(clock),
          kind =
            id === 'archiveProject' ? ('project.archive' as const) : ('project.delete' as const),
          activityId = activity(
            data,
            next,
            id === 'archiveProject' ? 'project.archived' : 'project.deleted',
            clock,
          );
        data.projectCommands.undoRecords[undoId] = {
          actorId: data.currentMemberId,
          projectId: next.id,
          kind,
          postVersion: next.version,
          lifecycleAt: now,
          previousArchivedAt: project.archivedAt,
          activityId,
          result: null,
        };
        result.undo = { id: undoId, kind };
      }
      return { data: result };
    }
    case 'undoCommand': {
      const undoId = EntityIdSchema.parse(input.undoId),
        record = data.projectCommands.undoRecords[undoId];
      if (!record || record.actorId !== data.currentMemberId)
        return fail('NOT_FOUND', 'Undo not found');
      projectOf(data, record.projectId, false, record.kind === 'project.delete');
      if (record.result) return { data: record.result };
      const project = editable(
        data,
        record.projectId,
        record.postVersion,
        record.kind === 'project.delete',
      );
      if (
        record.kind === 'project.archive'
          ? project.archivedAt !== record.lifecycleAt ||
            !!data.projectCommands.deletedProjects[project.id]
          : data.projectCommands.deletedProjects[project.id] !== record.lifecycleAt ||
            project.archivedAt !== record.previousArchivedAt
      )
        return fail('CONFLICT', 'The project changed. Undo cannot be applied.');
      if (record.kind === 'project.delete') {
        delete data.projectCommands.deletedProjects[project.id];
        delete data.projectCommands.deletedBy[project.id];
      }
      data.projects[project.id] = {
        ...project,
        archivedAt: record.previousArchivedAt,
        version: project.version + 1,
        updatedAt: clock.now(),
      };
      delete data.activity[record.activityId];
      record.result = UndoResultSchema.parse({
        undoId,
        kind: record.kind,
        appliedAt: clock.now(),
        affected: {
          projectIds: [project.id],
          taskIds: [],
          memberIds: [],
          teamIds: [],
          commentIds: [],
          fileIds: [],
        },
      });
      return { data: record.result };
    }
    case 'addProjectFavorite':
    case 'removeProjectFavorite': {
      const project = projectOf(data, input.projectId);
      const favorites = new Set(data.projectCommands.favorites[data.currentMemberId] ?? []);
      if (id === 'addProjectFavorite') favorites.add(project.id);
      else favorites.delete(project.id);
      data.projectCommands.favorites[data.currentMemberId] = [...favorites];
      return { data: { projectId: project.id, isFavorite: favorites.has(project.id) } };
    }
    case 'updateProjectOrder': {
      const { projectIds } = UpdateProjectOrderInputSchema.parse(input.body);
      if (
        projectIds.some(
          (id) =>
            !data.projects[id] ||
            data.projects[id]!.archivedAt ||
            data.projectCommands.deletedProjects[id],
        )
      )
        return fail('VALIDATION_ERROR', 'Choose visible projects in this workspace');
      data.projectCommands.orders[data.currentMemberId] = [
        ...projectIds,
        ...data.projectOrder.filter((id) => !projectIds.includes(id)),
      ];
      return { data: { projectIds } };
    }
    case 'listSavedViews': {
      const project = projectOf(data, input.projectId);
      return {
        data: Object.values(data.savedViews)
          .filter((view) => view.projectId === project.id)
          .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
      };
    }
    case 'createSavedView': {
      const project = projectOf(data, input.projectId),
        body = CreateSavedViewInputSchema.parse(input.body);
      if (project.archivedAt) return fail('CONFLICT', 'Restore the project before saving a view');
      const view = SavedViewSchema.parse({
        ...body,
        id: newMockId(clock),
        workspaceId: data.workspaceId,
        projectId: project.id,
        createdBy: data.currentMemberId,
        position:
          Math.max(
            -100,
            ...Object.values(data.savedViews)
              .filter((view) => view.projectId === project.id)
              .map((view) => view.position),
          ) + 100,
        version: 1,
      });
      data.savedViews[view.id] = view;
      return { data: view };
    }
    case 'updateSavedView':
    case 'deleteSavedView': {
      const viewId = EntityIdSchema.parse(input.viewId),
        view = data.savedViews[viewId];
      if (!view) return fail('NOT_FOUND', 'View not found');
      const project = projectOf(data, view.projectId);
      if (project.archivedAt) return fail('CONFLICT', 'Restore the project before changing views');
      const body =
        id === 'updateSavedView'
          ? UpdateSavedViewInputSchema.parse(input.body)
          : VersionInputSchema.parse(input.body);
      if (view.version !== body.expectedVersion)
        return fail('CONFLICT', 'This view changed. Refresh and try again.');
      if (id === 'deleteSavedView') {
        delete data.savedViews[view.id];
        return { data: { viewId } };
      }
      const patch = Object.fromEntries(
        Object.entries(body).filter(([key]) => key !== 'expectedVersion'),
      );
      const next = SavedViewSchema.parse({ ...view, ...patch, version: view.version + 1 });
      data.savedViews[next.id] = next;
      return { data: next };
    }
    default:
      throw new TypeError('Unsupported project operation');
  }
}
export function runProjectOperation(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
  persist?: (staged: MockDataset) => boolean,
) {
  return [
    'getProject',
    'listProjects',
    'getProjectSummary',
    'listProjectMembers',
    'listSavedViews',
  ].includes(id)
    ? execute(id, input, data, clock)
    : transactMock(data, async (staged) => {
        const result = await execute(id, input, staged, clock);
        if (persist && !persist(staged))
          throw new StudioApiError({
            error: { code: 'INTERNAL_ERROR', message: 'Changes could not be saved. Try again.' },
          });
        return result;
      });
}
export function hasProjectUndo(data: MockDataset, id: unknown) {
  const parsed = EntityIdSchema.safeParse(id);
  return parsed.success && !!data.projectCommands.undoRecords[parsed.data];
}
export { canReadMockProject };
