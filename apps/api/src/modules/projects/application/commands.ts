export type ProjectCreationSource =
  | { kind: 'template' }
  | { kind: 'copy'; source: ProjectRow; expectedVersion: number };
import type {
  CreateProjectInput,
  DuplicateProjectInput,
  EntityId,
  MemberDto,
  UpdateProjectInput,
} from '@studio/contracts/api';
import { catalogs, CreateProjectInputSchema, EntityIdSchema } from '@studio/contracts/api';
import { addDateDays } from '@studio/domain';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import { encodeUndoPayload } from '../../../db/undo.ts';
import { instant, nullableInstant } from '../../../shared/clock.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import type { SubtaskRow, TaskRow } from '../../tasks/projections.ts';
import { createdTaskDtos } from '../../tasks/projections.ts';
import { today } from '../../workspaces/index.ts';
import { actorParameters, actorSql, creator, projectRow } from '../access.ts';
import { history, referenceGuard } from '../persistence/commands-fragments.ts';
import {
  createProjectBudget,
  createProjectCommit,
  createProjectGuardTasks,
  createProjectGuardTasksResult,
  createProjectInsert,
  createProjectInsertActivity,
  createProjectInsertProjectMembers,
  createProjectInsertProjects,
  createProjectMarkerProjects,
  createProjectPredicateProjects,
  createProjectPredicateProjectsResult,
  createProjectPrepareMemberProjectOrder,
  createProjectReadProjects,
  createProjectReadSubtasks,
  createProjectReadTaskDependencies,
  createProjectReadTaskLabels,
  createProjectReadTasks,
  createProjectReadTasksResult,
  lifecycleProjectBudget,
  lifecycleProjectCommit,
  lifecycleProjectFields,
  lifecycleProjectInsertActivity,
  lifecycleProjectInsertCommandUndoRecords,
  lifecycleProjectMarkerProjects,
  lifecycleProjectPrepareProjects,
  referencesReadTeams,
  referencesReadWorkspaceMembers,
  updateProjectBudget,
  updateProjectCommit,
  updateProjectFields,
  updateProjectInsertActivity,
  updateProjectMarkerProjects,
  updateProjectPrepareProjects,
} from '../persistence/commands.ts';
import type { ProjectRow } from '../projections.ts';
import { projectDto } from '../projections.ts';
async function references(
  r: RequestRepository,
  s: WorkspaceContext,
  leadId: string,
  teamId: string | null,
) {
  const [lead] = await referencesReadWorkspaceMembers(r, s, leadId);
  if (!lead) throw new ApiFailure('VALIDATION_ERROR', 'Choose an active workspace lead');
  if (teamId && !(await referencesReadTeams(r, s, teamId)).length)
    throw new ApiFailure('VALIDATION_ERROR', 'Choose an active workspace team');
}

async function response(
  r: RequestRepository,
  s: WorkspaceContext,
  pid: EntityId,
  now: number,
  created = false,
  undo: { id: EntityId; kind: 'project.archive' | 'project.delete' } | null = null,
) {
  const p = await projectRow(r, s, pid, {
    visibility: 'detail',
    lifecycle: 'including-deleted',
    access: 'read',
  });
  return {
    project: await projectDto(r, s, p, now),
    createdTasks: created ? await createdTaskDtos(r, s, p) : [],
    affectedProjectIds: [pid],
    taskIdMap: [],
    undo,
  };
}
export async function createProject(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  body: CreateProjectInput,
  now: number,
  sourcePlan: ProjectCreationSource = { kind: 'template' },
  generateId: IdGenerator = newId,
) {
  const copy = sourcePlan.kind === 'copy' ? sourcePlan : undefined;
  creator(actor);
  await references(r, s, body.leadId, body.teamId);
  const id = generateId(),
    marker = generateId(),
    date = await today(r, s, now),
    keys = await createProjectReadProjects(r, s);
  let key = body.name
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  if (key.length < 2)
    key =
      body.name
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'PRJ';
  while (keys.some((p) => p.key === key)) key += 'X';
  const [positionRow] = await createProjectReadTasks(r, s);
  let copiedTasks: TaskRow[] = [],
    copiedChildren: SubtaskRow[] = [],
    copiedLabels: Record<string, unknown>[] = [],
    copiedDeps: Record<string, unknown>[] = [],
    copyGuards: SqlPredicate[] = [];
  if (copy) {
    const source = copy.source;
    if (source.version !== copy.expectedVersion || source.archivedAt !== null)
      throw new ApiFailure('CONFLICT', 'Restore or refresh source project');
    copiedTasks = await createProjectReadTasksResult(r, s, source);
    if (copiedTasks.length > 128)
      throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Project copy exceeds bounded scope');
    copiedChildren = await createProjectReadSubtasks(r, s, source);
    copiedLabels = await createProjectReadTaskLabels(r, s, source);
    copiedDeps = await createProjectReadTaskDependencies(r, s, source);
    if (copiedTasks.length + copiedChildren.length + copiedLabels.length + copiedDeps.length > 512)
      throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Project copy exceeds bounded scope');
    copyGuards = [
      {
        sql: createProjectPredicateProjects(),
        parameters: [s.workspaceId, source.id, copy.expectedVersion, s.memberId],
      },
      createProjectGuardTasks(s, source, copiedTasks),
    ];
    for (const [table, rows, cols] of [
      [
        'subtasks',
        copiedChildren,
        [
          'id',
          'taskId',
          'title',
          'done',
          'assigneeId',
          'dueDate',
          'note',
          'position',
          'createdAt',
          'updatedAt',
        ],
      ],
      ['taskLabels', copiedLabels, ['taskId', 'labelId']],
      ['taskDependencies', copiedDeps, ['taskId', 'dependsOnTaskId']],
    ] as const)
      copyGuards.push(createProjectGuardTasksResult(table, s, source, rows, cols));
  }
  const map = new Map(copiedTasks.map((t) => [t.id, generateId()]));
  const template = required(
    catalogs.templates.find((t) => t.id === body.templateId),
    'Missing projects state',
  );
  const p: ProjectRow = {
    id,
    workspaceId: s.workspaceId,
    key,
    taskSequence: 200 + (copy ? copiedTasks.length : template.tasks.length),
    name: body.name,
    description: body.description || 'No description yet.',
    icon: body.icon,
    color: body.color,
    status: 'planning',
    teamId: body.teamId,
    leadId: body.leadId,
    startDate: date,
    dueDate: body.dueDate,
    visibility: 'workspace',
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    deletedAt: null,
    deletedBy: null,
    version: 1,
    lastMutationId: marker,
  };
  // Validate merged date-only counterparts before any writes.
  if (p.startDate && p.dueDate && p.startDate > p.dueDate)
    throw new ApiFailure('VALIDATION_ERROR', 'startDate exceeds dueDate');
  const baseTask = (index: number): TaskRow => ({
    id: generateId(),
    workspaceId: s.workspaceId,
    projectId: id,
    number: 201 + index,
    title: template.tasks[index] ?? '',
    descriptionHtml: '',
    descriptionText: '',
    status: index === 0 ? 'todo' : 'backlog',
    priority: index === 0 ? 'high' : 'medium',
    assigneeId: index === 0 ? s.memberId : null,
    startDate: addDateDays(date, index * 5),
    dueDate: addDateDays(date, 5 + index * 5),
    estimate: null,
    recurrence: null,
    position: required(positionRow, 'Missing projects state').position + 100 * (index + 1),
    completedAt: null,
    previousStatus: null,
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
  });
  const taskRows = copy
    ? copiedTasks.map((t, index) => ({
        ...baseTask(index),
        id: required(map.get(t.id), 'Missing projects state'),
        title: t.title,
        descriptionHtml: t.descriptionHtml,
        descriptionText: t.descriptionText,
        status: 'todo',
        priority: t.priority,
        assigneeId: t.assigneeId,
        startDate: t.startDate,
        dueDate: t.dueDate,
        estimate: t.estimate,
        recurrence: t.recurrence,
      }))
    : template.tasks.map((_, index) => baseTask(index));
  const childRows = copiedChildren.map((c) => ({
    ...c,
    id: generateId(),
    taskId: required(map.get(c.taskId), 'Missing projects state'),
    done: 0,
    createdAt: now,
    updatedAt: now,
  }));
  const labelRows = copiedLabels.map((l) => ({
    ...l,
    taskId: required(map.get(EntityIdSchema.parse(l.taskId)), 'Missing projects state'),
  }));
  const depRows = copiedDeps.flatMap((d) =>
    map.has(EntityIdSchema.parse(d.dependsOnTaskId))
      ? [
          {
            ...d,
            taskId: required(map.get(EntityIdSchema.parse(d.taskId)), 'Missing projects state'),
            dependsOnTaskId: required(
              map.get(EntityIdSchema.parse(d.dependsOnTaskId)),
              'Missing projects state',
            ),
          },
        ]
      : [],
  );
  const ref = referenceGuard(s, p.leadId, p.teamId),
    guard = {
      sql: [
        actorSql('creator'),
        ref.sql,
        createProjectPredicateProjectsResult(),
        ...copyGuards.map((g) => g.sql),
      ].join(' AND '),
      parameters: [
        ...actorParameters(s),
        ...ref.parameters,
        s.workspaceId,
        key,
        ...copyGuards.flatMap((g) => g.parameters),
      ],
    };
  const gate = { sql: createProjectMarkerProjects(), parameters: [id, marker] };
  const statements = [
    createProjectInsertProjects(r, p, guard),
    createProjectInsertProjectMembers(r, s, p, id, gate),
  ];
  for (const [table, rows] of [
    ['tasks', taskRows],
    ['subtasks', childRows],
    ['taskLabels', labelRows],
    ['taskDependencies', depRows],
  ] as const)
    if (rows.length) statements.push(createProjectInsert(rows, r, table, gate));
  statements.push(createProjectInsertActivity(r, s, p, marker, now, taskRows, gate, generateId));
  statements.push(createProjectPrepareMemberProjectOrder(r, gate, s, id));
  createProjectBudget(r, statements);
  await createProjectCommit(r, statements);
  const result = await response(r, s, id, now, true);
  return {
    ...result,
    taskIdMap: [...map].map(([sourceTaskId, targetTaskId]) => ({ sourceTaskId, targetTaskId })),
  };
}
export async function duplicateProject(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  id: EntityId,
  body: DuplicateProjectInput,
  now: number,
  generateId: IdGenerator = newId,
) {
  const source = await projectRow(r, s, id, {
    visibility: 'detail',
    lifecycle: 'detail',
    access: 'write',
  });
  return createProject(
    r,
    s,
    actor,
    CreateProjectInputSchema.parse({
      name: body.name,
      description: source.description,
      icon: source.icon,
      color: source.color,
      teamId: source.teamId,
      leadId: EntityIdSchema.parse(source.leadId),
      dueDate: source.dueDate,
      templateId: 'blank',
    }),
    now,
    { kind: 'copy', source, expectedVersion: body.expectedVersion },
    generateId,
  );
}
export async function updateProject(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: UpdateProjectInput,
  now: number,
  generateId: IdGenerator = newId,
) {
  const old = await projectRow(r, s, id, {
      visibility: 'detail',
      lifecycle: 'detail',
      access: 'write',
    }),
    { expectedVersion, ...patch } = body;
  if (old.version !== expectedVersion || old.archivedAt !== null)
    throw new ApiFailure('CONFLICT', 'Restore or refresh project');
  const merged: ProjectRow = {
    ...old,
    name: patch.name ?? old.name,
    description: patch.description ?? old.description,
    icon: patch.icon ?? old.icon,
    color: patch.color ?? old.color,
    status: patch.status ?? old.status,
    leadId: patch.leadId ?? old.leadId,
    teamId: patch.teamId === undefined ? old.teamId : patch.teamId,
    startDate: patch.startDate === undefined ? old.startDate : patch.startDate,
    dueDate: patch.dueDate === undefined ? old.dueDate : patch.dueDate,
  };
  await references(r, s, merged.leadId, merged.teamId);
  if (merged.startDate && merged.dueDate && merged.startDate > merged.dueDate)
    throw new ApiFailure('VALIDATION_ERROR', 'startDate exceeds dueDate');
  const marker = generateId(),
    fields = updateProjectFields(patch, now, marker),
    ref = referenceGuard(s, merged.leadId, merged.teamId),
    gate = { sql: updateProjectMarkerProjects(), parameters: [id, marker] };
  const statements = [
    updateProjectPrepareProjects(r, fields, ref, s, id, expectedVersion),
    updateProjectInsertActivity(r, s, merged, marker, now, gate, generateId),
  ];
  updateProjectBudget(r, statements);
  await updateProjectCommit(r, statements);
  return response(r, s, id, now);
}
export async function lifecycleProject(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  expectedVersion: number,
  operation: 'archive' | 'restore' | 'delete' | 'restore-deleted',
  now: number,
  generateId: IdGenerator = newId,
) {
  const old = await projectRow(r, s, id, {
    visibility: 'detail',
    lifecycle: operation === 'restore-deleted' ? 'including-deleted' : 'detail',
    access: 'write',
  });
  if (
    old.version !== expectedVersion ||
    (operation === 'archive' && old.archivedAt !== null) ||
    (operation === 'restore' && old.archivedAt === null) ||
    (operation === 'restore-deleted' && old.deletedAt === null)
  )
    throw new ApiFailure('CONFLICT', 'Project lifecycle changed');
  if (operation === 'restore-deleted' && old.deletedBy !== s.memberId)
    throw new ApiFailure('FORBIDDEN', 'Only deleting member can restore project');
  const marker = generateId(),
    undoId = generateId(),
    event = history(
      s,
      old,
      marker,
      now,
      operation === 'archive'
        ? 'project.archived'
        : operation === 'delete'
          ? 'project.deleted'
          : 'project.updated',
      undefined,
      generateId,
    );
  const undo =
    operation === 'archive' || operation === 'delete'
      ? {
          id: undoId,
          kind:
            operation === 'archive' ? ('project.archive' as const) : ('project.delete' as const),
        }
      : null;
  const payload = undo
    ? encodeUndoPayload({
        kind: undo.kind,
        activityIds: [event.id],
        targets: [
          {
            id,
            postVersion: old.version + 1,
            before: {
              archivedAt: nullableInstant(old.archivedAt),
              deletedAt: nullableInstant(old.deletedAt),
              deletedBy: old.deletedBy,
              updatedAt: instant(old.updatedAt),
            },
          },
        ],
      })
    : null;
  const fields = lifecycleProjectFields(operation, now, old, s, marker),
    gate = { sql: lifecycleProjectMarkerProjects(), parameters: [id, marker] };
  const statements = [
    lifecycleProjectPrepareProjects(r, fields, s, id, expectedVersion, old),
    lifecycleProjectInsertActivity(r, event, gate),
  ];
  if (undo)
    statements.push(
      lifecycleProjectInsertCommandUndoRecords(r, undoId, s, undo, payload, now, gate),
    );
  lifecycleProjectBudget(r, statements);
  await lifecycleProjectCommit(r, statements);
  return response(r, s, id, now, false, undo);
}
