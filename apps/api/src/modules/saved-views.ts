import { EntityIdSchema, SavedViewSchema } from '@studio/contracts/api';
import { ApiFailure } from '../errors.ts';
import { matchedBatch } from '../db/commands.ts';
import { projectRow, writeAccessSql } from './read-model.ts';
import { actorParameters, actorSql, newId } from './shared.ts';
import type { CreateSavedViewInput, UpdateSavedViewInput, EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
import type { savedViews } from '../db/schema.ts';
type ViewRow = Omit<typeof savedViews.$inferSelect, 'filtersJson'> & { filtersJson: string };
const dto = (v: ViewRow) =>
  SavedViewSchema.parse({
    id: v.id,
    workspaceId: v.workspaceId,
    projectId: v.projectId,
    name: v.name,
    type: v.type,
    filters: JSON.parse(v.filtersJson),
    createdBy: v.createdBy,
    position: v.position,
    version: v.version,
  });
function guard(s: WorkspaceContext, id: string) {
  return {
    sql: `EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=? AND p.id=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${writeAccessSql}) AND ${actorSql()}`,
    parameters: [s.workspaceId, id, s.memberId, ...actorParameters(s)],
  };
}
export async function listSavedViews(r: RequestRepository, s: WorkspaceContext, id: EntityId) {
  await projectRow(r, s, id, true);
  return (
    await r.all<ViewRow>(
      'SELECT * FROM savedViews WHERE workspaceId=? AND projectId=? ORDER BY position,id',
      [s.workspaceId, id],
    )
  ).map(dto);
}
export async function createSavedView(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: CreateSavedViewInput,
  now: number,
) {
  const p = await projectRow(r, s, id, true, false, true);
  if (p.archivedAt !== null)
    throw new ApiFailure('CONFLICT', 'Restore project before saving views');
  const viewId = newId(),
    g = guard(s, id);
  const results = await matchedBatch(r, [
    r.prepare(
      `INSERT INTO savedViews(id,workspaceId,projectId,name,type,filtersJson,createdBy,position,createdAt,updatedAt,version,lastMutationId) SELECT ?,?,?,?,?,?,?,(SELECT coalesce(max(position),-100)+100 FROM savedViews WHERE workspaceId=? AND projectId=?),?,?,1,? WHERE ${g.sql}`,
      [
        viewId,
        s.workspaceId,
        id,
        body.name,
        body.type,
        JSON.stringify(body.filters),
        s.memberId,
        s.workspaceId,
        id,
        now,
        now,
        viewId,
        ...g.parameters,
      ],
    ),
    r.prepare('SELECT * FROM savedViews WHERE workspaceId=? AND id=?', [s.workspaceId, viewId]),
  ]);
  return dto(results[1]!.results[0] as ViewRow);
}
export async function changeSavedView(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: UpdateSavedViewInput | { expectedVersion: number },
  now: number,
  remove = false,
) {
  const [view] = await r.all<ViewRow>('SELECT * FROM savedViews WHERE workspaceId=? AND id=?', [
    s.workspaceId,
    id,
  ]);
  if (!view) throw new ApiFailure('NOT_FOUND', 'View not found');
  const p = await projectRow(r, s, EntityIdSchema.parse(view.projectId), true, false, true);
  if (p.archivedAt !== null)
    throw new ApiFailure('CONFLICT', 'Restore project before changing views');
  const g = guard(s, view.projectId),
    patch = body as UpdateSavedViewInput,
    fields: Record<string, string | number> = { updatedAt: now, lastMutationId: newId() };
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.type !== undefined) fields.type = patch.type;
  if (patch.filters !== undefined) fields.filtersJson = JSON.stringify(patch.filters);
  const sql = remove
    ? 'DELETE FROM savedViews'
    : `UPDATE savedViews SET ${Object.keys(fields)
        .map((key) => key + '=?')
        .join(',')},version=version+1`;
  const statements = [
    r.prepare(`${sql} WHERE workspaceId=? AND id=? AND version=? AND ${g.sql}`, [
      ...(remove ? [] : Object.values(fields)),
      s.workspaceId,
      id,
      body.expectedVersion,
      ...g.parameters,
    ]),
  ];
  if (!remove)
    statements.push(
      r.prepare('SELECT * FROM savedViews WHERE workspaceId=? AND id=?', [s.workspaceId, id]),
    );
  const results = await matchedBatch(r, statements);
  return remove ? { viewId: id } : dto(results[1]!.results[0] as ViewRow);
}
