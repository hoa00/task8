import { catalogs, EntityIdSchema } from '@studio/contracts/api';
import { addDateDays } from '@studio/domain';
import { ApiFailure } from '../errors.ts';
import { encodeUndoPayload } from '../db/undo.ts';
import { exactSet, gatedInsert, matchedBatch } from '../db/commands.ts';
import {
  actorParameters,
  actorSql,
  creator,
  fitBatch,
  instant,
  markerSql,
  newId,
  nullableInstant,
  patchSql,
} from './shared.ts';
import { createdTaskDtos, projectDto, projectRow, today, writeAccessSql } from './read-model.ts';
import type { ProjectRow, TaskRow, SubtaskRow } from './read-model.ts';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
import type { SqlPredicate } from '../db/commands.ts';
import type {
  CreateProjectInput,
  DuplicateProjectInput,
  EntityId,
  MemberDto,
  UpdateProjectInput,
} from '@studio/contracts/api';

async function references(
  r: RequestRepository,
  s: WorkspaceContext,
  leadId: string,
  teamId: string | null,
) {
  const [lead] = await r.all(
    `SELECT id FROM workspaceMembers WHERE workspaceId=? AND id=? AND status='active' AND removedAt IS NULL`,
    [s.workspaceId, leadId],
  );
  if (!lead) throw new ApiFailure('VALIDATION_ERROR', 'Choose an active workspace lead');
  if (
    teamId &&
    !(
      await r.all('SELECT id FROM teams WHERE workspaceId=? AND id=? AND deletedAt IS NULL', [
        s.workspaceId,
        teamId,
      ])
    ).length
  )
    throw new ApiFailure('VALIDATION_ERROR', 'Choose an active workspace team');
}
const referenceGuard = (
  s: WorkspaceContext,
  leadId: string,
  teamId: string | null,
): SqlPredicate => ({
  sql: `EXISTS (SELECT 1 FROM workspaceMembers WHERE workspaceId=? AND id=? AND status='active' AND removedAt IS NULL) AND (? IS NULL OR EXISTS (SELECT 1 FROM teams WHERE workspaceId=? AND id=? AND deletedAt IS NULL))`,
  parameters: [s.workspaceId, leadId, teamId, s.workspaceId, teamId],
});
function history(
  s: WorkspaceContext,
  p: ProjectRow,
  marker: EntityId,
  now: number,
  eventType: string,
  task?: TaskRow,
) {
  return {
    id: newId(),
    workspaceId: s.workspaceId,
    projectId: p.id,
    taskId: task?.id ?? null,
    actorId: s.memberId,
    eventType,
    payloadJson: JSON.stringify(
      task
        ? { taskKey: `${p.key}-${task.number}`, taskTitle: task.title, projectName: p.name }
        : { projectName: p.name },
    ),
    commandId: marker,
    revertedAt: null,
    createdAt: now,
  };
}
async function response(
  r: RequestRepository,
  s: WorkspaceContext,
  pid: EntityId,
  now: number,
  created = false,
  undo: { id: EntityId; kind: 'project.archive' | 'project.delete' } | null = null,
) {
  const p = await projectRow(r, s, pid, false, true);
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
  copy?: { source: ProjectRow; expectedVersion: number },
) {
  creator(actor);
  await references(r, s, body.leadId, body.teamId);
  const id = newId(),
    marker = newId(),
    date = await today(r, s, now),
    keys = await r.all<{ key: string }>('SELECT key FROM projects WHERE workspaceId=?', [
      s.workspaceId,
    ]);
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
  const [positionRow] = await r.all<{ position: number }>(
    'SELECT coalesce(max(position),-100) position FROM tasks WHERE workspaceId=?',
    [s.workspaceId],
  );
  let copiedTasks: TaskRow[] = [],
    copiedChildren: SubtaskRow[] = [],
    copiedLabels: Record<string, unknown>[] = [],
    copiedDeps: Record<string, unknown>[] = [],
    copyGuards: SqlPredicate[] = [];
  if (copy) {
    const source = copy.source;
    if (source.version !== copy.expectedVersion || source.archivedAt !== null)
      throw new ApiFailure('CONFLICT', 'Restore or refresh source project');
    copiedTasks = await r.all<TaskRow>(
      'SELECT * FROM tasks WHERE workspaceId=? AND projectId=? AND archivedAt IS NULL AND deletedAt IS NULL ORDER BY position,id',
      [s.workspaceId, source.id],
    );
    if (copiedTasks.length > 128)
      throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Project copy exceeds bounded scope');
    copiedChildren = await r.all<SubtaskRow>(
      'SELECT c.* FROM subtasks c JOIN tasks t ON t.workspaceId=c.workspaceId AND t.id=c.taskId WHERE t.workspaceId=? AND t.projectId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL ORDER BY c.position,c.id',
      [s.workspaceId, source.id],
    );
    copiedLabels = await r.all<Record<string, unknown>>(
      'SELECT l.* FROM taskLabels l JOIN tasks t ON t.workspaceId=l.workspaceId AND t.id=l.taskId WHERE t.workspaceId=? AND t.projectId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL',
      [s.workspaceId, source.id],
    );
    copiedDeps = await r.all<Record<string, unknown>>(
      'SELECT d.* FROM taskDependencies d JOIN tasks t ON t.workspaceId=d.workspaceId AND t.id=d.taskId WHERE t.workspaceId=? AND t.projectId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL',
      [s.workspaceId, source.id],
    );
    if (copiedTasks.length + copiedChildren.length + copiedLabels.length + copiedDeps.length > 512)
      throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Project copy exceeds bounded scope');
    copyGuards = [
      {
        sql: `EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=? AND p.id=? AND p.version=? AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${writeAccessSql})`,
        parameters: [s.workspaceId, source.id, copy.expectedVersion, s.memberId],
      },
      exactSet(
        'tasks',
        'workspaceId=? AND projectId=? AND archivedAt IS NULL AND deletedAt IS NULL',
        [s.workspaceId, source.id],
        copiedTasks,
        ['id', 'version'],
      ),
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
      copyGuards.push(
        exactSet(
          table,
          `workspaceId=? AND taskId IN (SELECT id FROM tasks WHERE workspaceId=? AND projectId=? AND archivedAt IS NULL AND deletedAt IS NULL)`,
          [s.workspaceId, s.workspaceId, source.id],
          rows,
          [...cols],
        ),
      );
  }
  const map = new Map(copiedTasks.map((t) => [t.id, newId()]));
  const template = catalogs.templates.find((t) => t.id === body.templateId)!;
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
    id: newId(),
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
    position: positionRow!.position + 100 * (index + 1),
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
        id: map.get(t.id)!,
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
    id: newId(),
    taskId: map.get(c.taskId)!,
    done: 0,
    createdAt: now,
    updatedAt: now,
  }));
  const labelRows = copiedLabels.map((l) => ({ ...l, taskId: map.get(l.taskId as string)! }));
  const depRows = copiedDeps.flatMap((d) =>
    map.has(d.dependsOnTaskId as string)
      ? [
          {
            ...d,
            taskId: map.get(d.taskId as string)!,
            dependsOnTaskId: map.get(d.dependsOnTaskId as string)!,
          },
        ]
      : [],
  );
  const ref = referenceGuard(s, p.leadId, p.teamId),
    guard = {
      sql: [
        actorSql(false, true),
        ref.sql,
        'NOT EXISTS (SELECT 1 FROM projects WHERE workspaceId=? AND key=?)',
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
  const gate = { sql: markerSql('projects'), parameters: [id, marker] };
  const statements = [
    gatedInsert(r, 'projects', [p], guard),
    gatedInsert(
      r,
      'projectMembers',
      [...new Set([s.memberId, p.leadId])].map((memberId) => ({
        workspaceId: s.workspaceId,
        projectId: id,
        memberId,
        permission: 'edit',
      })),
      gate,
    ),
  ];
  for (const [table, rows] of [
    ['tasks', taskRows],
    ['subtasks', childRows],
    ['taskLabels', labelRows],
    ['taskDependencies', depRows],
  ] as const)
    if (rows.length) statements.push(gatedInsert(r, table, rows, gate));
  statements.push(
    gatedInsert(
      r,
      'activity',
      [
        history(s, p, marker, now, 'project.created'),
        ...taskRows.map((t) => history(s, p, marker, now, 'task.created', t)),
      ],
      gate,
    ),
  );
  statements.push(
    r.prepare(
      `INSERT INTO memberProjectOrder(workspaceId,memberId,projectId,position) SELECT ?,?,?,coalesce(min(position),0)-100 FROM memberProjectOrder WHERE workspaceId=? AND memberId=? HAVING ${gate.sql}`,
      [s.workspaceId, s.memberId, id, s.workspaceId, s.memberId, ...gate.parameters],
    ),
  );
  fitBatch(r, statements.length, 8);
  await matchedBatch(r, statements);
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
) {
  const source = await projectRow(r, s, id, false, false, true);
  return createProject(
    r,
    s,
    actor,
    {
      name: body.name,
      description: source.description,
      icon: source.icon as CreateProjectInput['icon'],
      color: source.color,
      teamId: source.teamId as EntityId | null,
      leadId: EntityIdSchema.parse(source.leadId),
      dueDate: source.dueDate as CreateProjectInput['dueDate'],
      templateId: 'blank',
    },
    now,
    { source, expectedVersion: body.expectedVersion },
  );
}
export async function updateProject(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: UpdateProjectInput,
  now: number,
) {
  const old = await projectRow(r, s, id, false, false, true),
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
  const marker = newId(),
    fields = patchSql({ ...patch, updatedAt: now, lastActivityAt: now, lastMutationId: marker }),
    ref = referenceGuard(s, merged.leadId, merged.teamId),
    gate = { sql: markerSql('projects'), parameters: [id, marker] };
  const statements = [
    r.prepare(
      `UPDATE projects AS p SET ${fields.sql},version=version+1 WHERE workspaceId=? AND id=? AND version=? AND archivedAt IS NULL AND deletedAt IS NULL AND ${writeAccessSql} AND ${actorSql()} AND ${ref.sql}`,
      [
        ...fields.parameters,
        s.workspaceId,
        id,
        expectedVersion,
        s.memberId,
        ...actorParameters(s),
        ...ref.parameters,
      ],
    ),
    gatedInsert(r, 'activity', [history(s, merged, marker, now, 'project.updated')], gate),
  ];
  fitBatch(r, statements.length, 4);
  await matchedBatch(r, statements);
  return response(r, s, id, now);
}
export async function lifecycleProject(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  expectedVersion: number,
  operation: 'archive' | 'restore' | 'delete' | 'restore-deleted',
  now: number,
) {
  const old = await projectRow(r, s, id, false, operation === 'restore-deleted', true);
  if (
    old.version !== expectedVersion ||
    (operation === 'archive' && old.archivedAt !== null) ||
    (operation === 'restore' && old.archivedAt === null) ||
    (operation === 'restore-deleted' && old.deletedAt === null)
  )
    throw new ApiFailure('CONFLICT', 'Project lifecycle changed');
  if (operation === 'restore-deleted' && old.deletedBy !== s.memberId)
    throw new ApiFailure('FORBIDDEN', 'Only deleting member can restore project');
  const marker = newId(),
    undoId = newId(),
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
  const fields = patchSql({
      archivedAt: operation === 'archive' ? now : operation === 'restore' ? null : old.archivedAt,
      deletedAt:
        operation === 'delete' ? now : operation === 'restore-deleted' ? null : old.deletedAt,
      deletedBy:
        operation === 'delete'
          ? s.memberId
          : operation === 'restore-deleted'
            ? null
            : old.deletedBy,
      updatedAt: now,
      lastMutationId: marker,
    }),
    gate = { sql: markerSql('projects'), parameters: [id, marker] };
  const statements = [
    r.prepare(
      `UPDATE projects AS p SET ${fields.sql},version=version+1 WHERE workspaceId=? AND id=? AND version=? AND archivedAt IS ? AND deletedAt IS ? AND deletedBy IS ? AND ${writeAccessSql} AND ${actorSql()}`,
      [
        ...fields.parameters,
        s.workspaceId,
        id,
        expectedVersion,
        old.archivedAt,
        old.deletedAt,
        old.deletedBy,
        s.memberId,
        ...actorParameters(s),
      ],
    ),
    gatedInsert(r, 'activity', [event], gate),
  ];
  if (undo)
    statements.push(
      gatedInsert(
        r,
        'commandUndoRecords',
        [
          {
            id: undoId,
            workspaceId: s.workspaceId,
            actorMemberId: s.memberId,
            kind: undo.kind,
            payloadVersion: 1,
            payloadJson: payload,
            createdAt: now,
            consumedAt: null,
            resultJson: null,
          },
        ],
        gate,
      ),
    );
  fitBatch(r, statements.length, 4);
  await matchedBatch(r, statements);
  return response(r, s, id, now, false, undo);
}
