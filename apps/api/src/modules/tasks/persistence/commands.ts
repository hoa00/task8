import type { TaskProjection } from './model.ts';
import type { Plan } from './plan.ts';
import { taskSelect } from './reads.ts';
import { validateRelations } from './relations.ts';
import { dependencyIds, relation, visibleDependencies } from './values.ts';

import { EntityIdSchema } from '@studio/contracts/api';
import { changedDependencyTargets } from '@studio/domain';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import { exactSet, fitBatch, gatedInsert, markerSql } from '../../../db/commands.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { actorParameters, actorSql } from '../../projects/index.ts';

const fields = [
  'projectId',
  'number',
  'title',
  'descriptionHtml',
  'descriptionText',
  'status',
  'priority',
  'assigneeId',
  'startDate',
  'dueDate',
  'estimate',
  'recurrence',
  'position',
  'completedAt',
  'previousStatus',
  'updatedAt',
  'archivedAt',
  'deletedAt',
  'deletedBy',
  'lastMutationId',
] as const;
export async function execute(r: RequestRepository, s: WorkspaceContext, plan: Plan, now: number) {
  if (
    plan.created.length + plan.children.length + plan.labels.length + plan.dependencies.length >
    512
  )
    throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Task command exceeds bounded child scope');
  const marker = plan.ids(),
    gate: SqlPredicate = { sql: markerSql('workspaces'), parameters: [s.workspaceId, marker] };
  const targetGuard = exactSet(
    'tasks',
    'workspaceId=? AND id IN (SELECT value FROM json_each(?))',
    [s.workspaceId, JSON.stringify(plan.before.map((t) => t.id))],
    plan.before,
    ['id', 'version', 'projectId', 'archivedAt', 'deletedAt', 'deletedBy'],
  );
  const refs = plan.changed
    .map((t) =>
      relation(
        t,
        plan.replaceDependencies.includes(t.id)
          ? plan.dependencies.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId)
          : visibleDependencies(requireTask(plan.before, t.id)),
      ),
    )
    .concat(
      plan.created.map((t) =>
        relation(
          t,
          plan.dependencies.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
          plan.children.filter((c) => c.taskId === t.id),
        ),
      ),
    );
  // Lifecycle commands may retain preexisting dependencies that have since been archived.
  const relationCheck = refs.length
    ? await validateRelations(
        r,
        s,
        refs.map((t) => ({
          ...t,
          dependencyIds:
            plan.intent.kind === 'lifecycle' ||
            (plan.intent.kind === 'column' && plan.intent.operation === 'archive')
              ? []
              : t.dependencyIds,
        })),
      )
    : null;
  const accessGuard = plan.before.length
    ? await validateRelations(
        r,
        s,
        plan.before.map((t) => relation(t, [])),
      )
    : null;
  const guards = [
    targetGuard,
    ...(accessGuard ? [accessGuard] : []),
    ...plan.guards,
    ...(relationCheck ? [relationCheck] : []),
  ];
  if (plan.intent.kind === 'create')
    guards.push({
      sql: 'NOT EXISTS (SELECT 1 FROM tasks WHERE workspaceId=? AND createdBy=? AND createRequestId=?)',
      parameters: [s.workspaceId, s.memberId, plan.intent.request.id],
    });
  const statements = [
    r.prepare(
      `UPDATE workspaces SET lastMutationId=? WHERE id=? AND ${actorSql()} AND ${guards.map((g) => `(${g.sql})`).join(' AND ')}`,
      [marker, s.workspaceId, ...actorParameters(s), ...guards.flatMap((g) => g.parameters)],
    ),
  ];
  if (plan.allocations.length)
    statements.push(
      r.prepare(
        `UPDATE projects SET taskSequence=taskSequence+(SELECT json_extract(value,'$.count') FROM json_each(?) WHERE json_extract(value,'$.projectId')=projects.id) WHERE workspaceId=? AND id IN (SELECT json_extract(value,'$.projectId') FROM json_each(?)) AND ${gate.sql}`,
        [
          JSON.stringify(plan.allocations),
          s.workspaceId,
          JSON.stringify(plan.allocations),
          ...gate.parameters,
        ],
      ),
    );
  if (plan.changed.length) {
    const json = JSON.stringify(
      plan.changed.map((t) => ({ ...t, updatedAt: now, lastMutationId: marker })),
    );
    const expression = (field: (typeof fields)[number]) =>
      field === 'number'
        ? `CASE WHEN projectId != (SELECT json_extract(value,'$.projectId') FROM json_each(?) WHERE json_extract(value,'$.id')=tasks.id) THEN (SELECT p.taskSequence-(SELECT json_extract(value,'$.count') FROM json_each(?) WHERE json_extract(value,'$.projectId')=p.id)+(SELECT json_extract(value,'$.number') FROM json_each(?) WHERE json_extract(value,'$.id')=tasks.id) FROM projects p WHERE p.id=(SELECT json_extract(value,'$.projectId') FROM json_each(?) WHERE json_extract(value,'$.id')=tasks.id)) ELSE number END`
        : `(SELECT json_extract(value,'$.${field}') FROM json_each(?) WHERE json_extract(value,'$.id')=tasks.id)`;
    // number is allocated before projectId changes; SQLite RHS expressions see the old row.
    const cols: (typeof fields)[number][] = ['number', ...fields.filter((f) => f !== 'number')];
    statements.push(
      r.prepare(
        `UPDATE tasks SET ${cols.map((f) => `${f}=${expression(f)}`).join(',')},version=version+1 WHERE workspaceId=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND ${gate.sql}`,
        [
          ...cols.flatMap((f) =>
            f === 'number' ? [json, JSON.stringify(plan.allocations), json, json] : [json],
          ),
          s.workspaceId,
          json,
          ...gate.parameters,
        ],
      ),
    );
  }
  const moves = plan.changed.filter((t) =>
    plan.before.some((b) => b.id === t.id && b.projectId !== t.projectId),
  );
  if (moves.length)
    statements.push(
      r.prepare(
        `UPDATE files SET projectId=(SELECT json_extract(value,'$.projectId') FROM json_each(?) WHERE json_extract(value,'$.id')=files.taskId),version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND taskId IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND ${gate.sql}`,
        [
          JSON.stringify(moves),
          now,
          marker,
          s.workspaceId,
          JSON.stringify(moves),
          ...gate.parameters,
        ],
      ),
    );
  if (plan.created.length) {
    const columns = [
        ...fields,
        'id',
        'workspaceId',
        'recurrenceSourceTaskId',
        'cancelledByUndoId',
        'createdBy',
        'createRequestId',
        'createRequestHash',
        'createdAt',
        'version',
      ],
      json = JSON.stringify(plan.created.map((t) => ({ ...t, lastMutationId: marker })));
    statements.push(
      r.prepare(
        `INSERT INTO tasks(${columns.join(',')}) SELECT ${columns.map((c) => (c === 'number' ? `p.taskSequence-(SELECT json_extract(value,'$.count') FROM json_each(?) WHERE json_extract(value,'$.projectId')=p.id)+json_extract(intent.value,'$.number')` : c === 'position' ? `(SELECT coalesce(max(position),-100) FROM tasks WHERE workspaceId=?)+100*(CAST(intent.key AS INTEGER)+1)` : `json_extract(intent.value,'$.${c}')`)).join(',')} FROM json_each(?) intent JOIN projects p ON p.id=json_extract(intent.value,'$.projectId') AND p.workspaceId=? WHERE ${gate.sql}`,
        [JSON.stringify(plan.allocations), s.workspaceId, json, s.workspaceId, ...gate.parameters],
      ),
    );
  }
  for (const [table, ids] of [
    ['taskLabels', plan.replaceLabels],
    ['taskDependencies', plan.replaceDependencies],
  ] as const)
    if (ids.length)
      statements.push(
        r.prepare(
          `DELETE FROM ${table} WHERE workspaceId=? AND taskId IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
          [s.workspaceId, JSON.stringify(ids), ...gate.parameters],
        ),
      );
  for (const [table, rows] of [
    ['subtasks', plan.children],
    ['taskLabels', plan.labels],
    ['taskDependencies', plan.dependencies],
  ] as const)
    if (rows.length) statements.push(gatedInsert<(typeof rows)[number]>(r, table, rows, gate));
  const touched = [
    ...new Set([
      ...plan.created.flatMap((t) =>
        plan.dependencies.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
      ),
      ...plan.replaceDependencies.flatMap((id) =>
        changedDependencyTargets(
          dependencyIds(requireTask(plan.before, id)).map((id) => EntityIdSchema.parse(id)),
          plan.dependencies
            .filter((d) => d.taskId === id)
            .map((d) => EntityIdSchema.parse(d.dependsOnTaskId)),
        ),
      ),
    ]),
  ].filter(
    (id) => !plan.changed.some((t) => t.id === id) && !plan.created.some((t) => t.id === id),
  );
  if (touched.length)
    statements.push(
      r.prepare(
        `UPDATE tasks SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
        [now, marker, s.workspaceId, JSON.stringify(touched), ...gate.parameters],
      ),
    );
  if (plan.events.length)
    statements.push(
      gatedInsert(
        r,
        'activity',
        plan.events.map((e) => ({ ...e, commandId: marker })),
        gate,
      ),
    );
  if (plan.undo)
    statements.push(
      r.prepare(
        `INSERT INTO commandUndoRecords(id,workspaceId,actorMemberId,kind,payloadVersion,payloadJson,createdAt,consumedAt,resultJson) SELECT ?,?,?,?,1,json_set(?,'$.targets',json((SELECT json_group_array(json_set(value,'$.postVersion',(SELECT version FROM tasks WHERE workspaceId=? AND id=json_extract(value,'$.id')))) FROM json_each(?,'$.targets')))),?,NULL,NULL WHERE ${gate.sql}`,
        [
          plan.undo.descriptor.id,
          s.workspaceId,
          s.memberId,
          plan.undo.descriptor.kind,
          requireUndoPayload(plan),
          s.workspaceId,
          requireUndoPayload(plan),
          now,
          ...gate.parameters,
        ],
      ),
    );
  const ids = [...plan.before.map((t) => t.id), ...plan.created.map((t) => t.id), ...touched];
  statements.push(
    r.prepare(
      `${taskSelect} WHERE t.workspaceId=? AND t.id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,
      [s.memberId, s.memberId, s.workspaceId, JSON.stringify(ids), ...gate.parameters],
    ),
  );
  fitBatch(r, statements.length, plan.intent.kind === 'create' ? 1 : 0);
  const results = await r.batch<TaskProjection>(statements);
  if (results[0]?.meta.changes !== 1) return null;
  const final = results.at(-1);
  if (!final) throw new ApiFailure('INTERNAL_ERROR', 'Missing task command result');
  const rows = final.results;
  return {
    tasks: plan.before.map((t) => requireTask(rows, t.id)),
    createdTasks: plan.created.map((t) => requireTask(rows, t.id)),
    affectedProjectIds: [
      ...new Set(
        [...plan.before, ...plan.changed, ...plan.created, ...rows].map((t) =>
          EntityIdSchema.parse(t.projectId),
        ),
      ),
    ],
    undo: plan.undo?.descriptor ?? null,
  };
}
function requireTask(rows: TaskProjection[], id: string): TaskProjection {
  const row = rows.find((t) => t.id === id);
  if (!row) throw new ApiFailure('INTERNAL_ERROR', 'Missing final task projection');
  return row;
}

function requireUndoPayload(plan: Plan): string {
  if (plan.undo === null) throw new ApiFailure('INTERNAL_ERROR', 'Missing task undo payload');
  return plan.undo.payload;
}
