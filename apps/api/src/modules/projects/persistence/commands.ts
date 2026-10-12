import type { DateOnly, EntityId } from '@studio/contracts/api';
import type { RequestRepository, SqlValue, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import {
  exactSet,
  fitBatch,
  gatedInsert,
  markerSql,
  matchedBatch,
  patchSql,
} from '../../../db/commands.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import type { SubtaskRow, TaskRow } from '../../tasks/projections.ts';
import { actorParameters, actorSql, writeAccessSql } from '../access.ts';
import { history } from './commands-fragments.ts';
export function referencesReadWorkspaceMembers(
  r: RequestRepository,
  s: WorkspaceContext,
  leadId: string,
) {
  return r.all(
    `SELECT id FROM workspaceMembers WHERE workspaceId=? AND id=? AND status='active' AND removedAt IS NULL`,
    [s.workspaceId, leadId],
  );
}
export function referencesReadTeams(r: RequestRepository, s: WorkspaceContext, teamId: string) {
  return r.all('SELECT id FROM teams WHERE workspaceId=? AND id=? AND deletedAt IS NULL', [
    s.workspaceId,
    teamId,
  ]);
}
export function createProjectReadProjects(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ key: string }>('SELECT key FROM projects WHERE workspaceId=?', [s.workspaceId]);
}
export function createProjectReadTasks(r: RequestRepository, s: WorkspaceContext) {
  return r.all<{ position: number }>(
    'SELECT coalesce(max(position),-100) position FROM tasks WHERE workspaceId=?',
    [s.workspaceId],
  );
}
export function createProjectReadTasksResult(
  r: RequestRepository,
  s: WorkspaceContext,
  source: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
) {
  return r.all<TaskRow>(
    'SELECT * FROM tasks WHERE workspaceId=? AND projectId=? AND archivedAt IS NULL AND deletedAt IS NULL ORDER BY position,id',
    [s.workspaceId, source.id],
  );
}
export function createProjectReadSubtasks(
  r: RequestRepository,
  s: WorkspaceContext,
  source: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
) {
  return r.all<SubtaskRow>(
    'SELECT c.* FROM subtasks c JOIN tasks t ON t.workspaceId=c.workspaceId AND t.id=c.taskId WHERE t.workspaceId=? AND t.projectId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL ORDER BY c.position,c.id',
    [s.workspaceId, source.id],
  );
}
export function createProjectReadTaskLabels(
  r: RequestRepository,
  s: WorkspaceContext,
  source: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
) {
  return r.all<Record<string, unknown>>(
    'SELECT l.* FROM taskLabels l JOIN tasks t ON t.workspaceId=l.workspaceId AND t.id=l.taskId WHERE t.workspaceId=? AND t.projectId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL',
    [s.workspaceId, source.id],
  );
}
export function createProjectReadTaskDependencies(
  r: RequestRepository,
  s: WorkspaceContext,
  source: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
) {
  return r.all<Record<string, unknown>>(
    'SELECT d.* FROM taskDependencies d JOIN tasks t ON t.workspaceId=d.workspaceId AND t.id=d.taskId WHERE t.workspaceId=? AND t.projectId=? AND t.archivedAt IS NULL AND t.deletedAt IS NULL',
    [s.workspaceId, source.id],
  );
}
export function createProjectPredicateProjects() {
  return `EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=? AND p.id=? AND p.version=? AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${writeAccessSql})`;
}
export function createProjectGuardTasks(
  s: WorkspaceContext,
  source: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
  copiedTasks: {
    number: number;
    version: number;
    id: string;
    workspaceId: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    status: string;
    startDate: string | null;
    dueDate: string | null;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
    projectId: string;
    title: string;
    descriptionHtml: string;
    descriptionText: string;
    priority: string;
    assigneeId: string | null;
    estimate: string | null;
    recurrence: string | null;
    position: number;
    completedAt: number | null;
    previousStatus: string | null;
    recurrenceSourceTaskId: string | null;
    cancelledByUndoId: string | null;
    createdBy: string;
    createRequestId: string | null;
    createRequestHash: string | null;
  }[],
) {
  return exactSet(
    'tasks',
    'workspaceId=? AND projectId=? AND archivedAt IS NULL AND deletedAt IS NULL',
    [s.workspaceId, source.id],
    copiedTasks,
    ['id', 'version'],
  );
}
export function createProjectGuardTasksResult(
  table: 'subtasks' | 'taskLabels' | 'taskDependencies',
  s: WorkspaceContext,
  source: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
  rows:
    | {
        id: string;
        workspaceId: string;
        createdAt: number;
        updatedAt: number;
        dueDate: string | null;
        title: string;
        assigneeId: string | null;
        position: number;
        taskId: string;
        done: boolean;
        note: string;
      }[]
    | Record<string, unknown>[],
  cols:
    | readonly [
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
      ]
    | readonly ['taskId', 'labelId']
    | readonly ['taskId', 'dependsOnTaskId'],
) {
  return exactSet(
    table,
    `workspaceId=? AND taskId IN (SELECT id FROM tasks WHERE workspaceId=? AND projectId=? AND archivedAt IS NULL AND deletedAt IS NULL)`,
    [s.workspaceId, s.workspaceId, source.id],
    rows,
    [...cols],
  );
}
export function createProjectPredicateProjectsResult() {
  return 'NOT EXISTS (SELECT 1 FROM projects WHERE workspaceId=? AND key=?)';
}
export function createProjectMarkerProjects() {
  return markerSql('projects');
}
export function createProjectInsertProjects(
  r: RequestRepository,
  p: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
  guard: { sql: string; parameters: SqlValue[] },
) {
  return gatedInsert(r, 'projects', [p], guard);
}
export function createProjectInsertProjectMembers(
  r: RequestRepository,
  s: WorkspaceContext,
  p: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
  id: EntityId,
  gate: { sql: string; parameters: EntityId[] },
) {
  return gatedInsert(
    r,
    'projectMembers',
    [...new Set([s.memberId, p.leadId])].map((memberId) => ({
      workspaceId: s.workspaceId,
      projectId: id,
      memberId,
      permission: 'edit',
    })),
    gate,
  );
}
export function createProjectInsert(
  rows:
    | {
        number: number;
        version: number;
        id: string;
        workspaceId: string;
        createdAt: number;
        updatedAt: number;
        lastMutationId: string | null;
        status: string;
        startDate: string | null;
        dueDate: string | null;
        archivedAt: number | null;
        deletedAt: number | null;
        deletedBy: string | null;
        projectId: string;
        title: string;
        descriptionHtml: string;
        descriptionText: string;
        priority: string;
        assigneeId: string | null;
        estimate: string | null;
        recurrence: string | null;
        position: number;
        completedAt: number | null;
        previousStatus: string | null;
        recurrenceSourceTaskId: string | null;
        cancelledByUndoId: string | null;
        createdBy: string;
        createRequestId: string | null;
        createRequestHash: string | null;
      }[]
    | {
        id: EntityId;
        taskId: EntityId;
        done: number;
        createdAt: number;
        updatedAt: number;
        workspaceId: string;
        dueDate: string | null;
        title: string;
        assigneeId: string | null;
        position: number;
        note: string;
      }[]
    | { taskId: EntityId }[]
    | { taskId: EntityId; dependsOnTaskId: EntityId }[],
  r: RequestRepository,
  table: 'tasks' | 'subtasks' | 'taskLabels' | 'taskDependencies',
  gate: { sql: string; parameters: EntityId[] },
) {
  return gatedInsert<(typeof rows)[number]>(r, table, rows, gate);
}
export function createProjectInsertActivity(
  r: RequestRepository,
  s: WorkspaceContext,
  p: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
  marker: EntityId,
  now: number,
  taskRows: {
    number: number;
    version: number;
    id: string;
    workspaceId: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    status: string;
    startDate: string | null;
    dueDate: string | null;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
    projectId: string;
    title: string;
    descriptionHtml: string;
    descriptionText: string;
    priority: string;
    assigneeId: string | null;
    estimate: string | null;
    recurrence: string | null;
    position: number;
    completedAt: number | null;
    previousStatus: string | null;
    recurrenceSourceTaskId: string | null;
    cancelledByUndoId: string | null;
    createdBy: string;
    createRequestId: string | null;
    createRequestHash: string | null;
  }[],
  gate: { sql: string; parameters: EntityId[] },
  generateId: IdGenerator = newId,
) {
  return gatedInsert(
    r,
    'activity',
    [
      history(s, p, marker, now, 'project.created', undefined, generateId),
      ...taskRows.map((t) => history(s, p, marker, now, 'task.created', t, generateId)),
    ],
    gate,
  );
}
export function createProjectPrepareMemberProjectOrder(
  r: RequestRepository,
  gate: { sql: string; parameters: EntityId[] },
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.prepare(
    `INSERT INTO memberProjectOrder(workspaceId,memberId,projectId,position) SELECT ?,?,?,coalesce(min(position),0)-100 FROM memberProjectOrder WHERE workspaceId=? AND memberId=? HAVING ${gate.sql}`,
    [s.workspaceId, s.memberId, id, s.workspaceId, s.memberId, ...gate.parameters],
  );
}
export function createProjectBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 8);
}
export function createProjectCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return matchedBatch(r, statements);
}
export function updateProjectFields(
  patch: {
    name?: string | undefined;
    description?: string | undefined;
    icon?:
      | 'globe'
      | 'smartphone'
      | 'megaphone'
      | 'rocket'
      | 'component'
      | 'building-2'
      | 'layout-grid'
      | 'palette'
      | 'code'
      | 'briefcase'
      | 'target'
      | 'layers'
      | 'zap'
      | 'heart'
      | 'folder'
      | 'sparkles'
      | undefined;
    color?: string | undefined;
    teamId?: EntityId | null | undefined;
    leadId?: EntityId | undefined;
    startDate?: DateOnly | null | undefined;
    dueDate?: DateOnly | null | undefined;
    status?: 'active' | 'planning' | 'risk' | 'hold' | 'complete' | undefined;
  },
  now: number,
  marker: EntityId,
) {
  return patchSql({ ...patch, updatedAt: now, lastActivityAt: now, lastMutationId: marker });
}
export function updateProjectMarkerProjects() {
  return markerSql('projects');
}
export function updateProjectPrepareProjects(
  r: RequestRepository,
  fields: { sql: string; parameters: (string | number | null)[] },
  ref: SqlPredicate,
  s: WorkspaceContext,
  id: EntityId,
  expectedVersion: number,
) {
  return r.prepare(
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
  );
}
export function updateProjectInsertActivity(
  r: RequestRepository,
  s: WorkspaceContext,
  merged: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  },
  marker: EntityId,
  now: number,
  gate: { sql: string; parameters: EntityId[] },
  generateId: IdGenerator = newId,
) {
  return gatedInsert(
    r,
    'activity',
    [history(s, merged, marker, now, 'project.updated', undefined, generateId)],
    gate,
  );
}
export function updateProjectBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 4);
}
export function updateProjectCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return matchedBatch(r, statements);
}
export function lifecycleProjectFields(
  operation: 'archive' | 'restore' | 'delete' | 'restore-deleted',
  now: number,
  old: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  } & { allowed: number },
  s: WorkspaceContext,
  marker: EntityId,
) {
  return patchSql({
    archivedAt: operation === 'archive' ? now : operation === 'restore' ? null : old.archivedAt,
    deletedAt:
      operation === 'delete' ? now : operation === 'restore-deleted' ? null : old.deletedAt,
    deletedBy:
      operation === 'delete' ? s.memberId : operation === 'restore-deleted' ? null : old.deletedBy,
    updatedAt: now,
    lastMutationId: marker,
  });
}
export function lifecycleProjectMarkerProjects() {
  return markerSql('projects');
}
export function lifecycleProjectPrepareProjects(
  r: RequestRepository,
  fields: { sql: string; parameters: (string | number | null)[] },
  s: WorkspaceContext,
  id: EntityId,
  expectedVersion: number,
  old: {
    version: number;
    id: string;
    workspaceId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    lastMutationId: string | null;
    key: string;
    taskSequence: number;
    description: string;
    icon: string;
    color: string;
    status: string;
    teamId: string | null;
    leadId: string;
    startDate: string | null;
    dueDate: string | null;
    visibility: string;
    lastActivityAt: number;
    archivedAt: number | null;
    deletedAt: number | null;
    deletedBy: string | null;
  } & { allowed: number },
) {
  return r.prepare(
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
  );
}
export function lifecycleProjectInsertActivity(
  r: RequestRepository,
  event: {
    id: EntityId;
    workspaceId: EntityId;
    projectId: string;
    taskId: string | null;
    actorId: EntityId;
    eventType: string;
    payloadJson: string;
    commandId: EntityId;
    revertedAt: null;
    createdAt: number;
  },
  gate: { sql: string; parameters: EntityId[] },
) {
  return gatedInsert(r, 'activity', [event], gate);
}
export function lifecycleProjectInsertCommandUndoRecords(
  r: RequestRepository,
  undoId: EntityId,
  s: WorkspaceContext,
  undo: { id: EntityId; kind: 'project.archive' | 'project.delete' },
  payload: string | null,
  now: number,
  gate: { sql: string; parameters: EntityId[] },
) {
  return gatedInsert(
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
  );
}
export function lifecycleProjectBudget(r: RequestRepository, statements: D1PreparedStatement[]) {
  return fitBatch(r, statements.length, 4);
}
export function lifecycleProjectCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return matchedBatch(r, statements);
}
