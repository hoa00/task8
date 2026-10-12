export type SavedViewChange =
  | { kind: 'update'; input: UpdateSavedViewInput }
  | { kind: 'delete'; input: { expectedVersion: number } };
import type { CreateSavedViewInput, EntityId, UpdateSavedViewInput } from '@studio/contracts/api';
import { EntityIdSchema, SavedViewSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { actorParameters, projectRow } from '../access.ts';
import type { ViewRow } from '../persistence/saved-views-model.ts';
import {
  changeSavedViewCommit,
  changeSavedViewPredicateSavedViews,
  changeSavedViewPredicateSavedViewsResult,
  changeSavedViewPrepare,
  changeSavedViewPrepareSavedViews,
  changeSavedViewReadSavedViews,
  createSavedViewCommitSavedViews,
  guardPredicateProjects,
  listSavedViewsReadSavedViews,
} from '../persistence/saved-views.ts';

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
    sql: guardPredicateProjects(),
    parameters: [s.workspaceId, id, s.memberId, ...actorParameters(s)],
  };
}
export async function listSavedViews(r: RequestRepository, s: WorkspaceContext, id: EntityId) {
  await projectRow(r, s, id, { visibility: 'child', lifecycle: 'detail', access: 'read' });
  return (await listSavedViewsReadSavedViews(r, s, id)).map(dto);
}
export async function createSavedView(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  body: CreateSavedViewInput,
  now: number,
  generateId: IdGenerator = newId,
) {
  const p = await projectRow(r, s, id, {
    visibility: 'child',
    lifecycle: 'detail',
    access: 'write',
  });
  if (p.archivedAt !== null)
    throw new ApiFailure('CONFLICT', 'Restore project before saving views');
  const viewId = generateId(),
    g = guard(s, id);
  const results = await createSavedViewCommitSavedViews(r, g, viewId, s, id, body, now);
  return dto(
    required(
      required(results[1], 'Missing projects state').results[0],
      'Missing saved view projection',
    ),
  );
}
export async function changeSavedView(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  command: SavedViewChange,
  now: number,
  generateId: IdGenerator = newId,
) {
  const body = command.input,
    remove = command.kind === 'delete';
  const [view] = await changeSavedViewReadSavedViews(r, s, id);
  if (!view) throw new ApiFailure('NOT_FOUND', 'View not found');
  const p = await projectRow(r, s, EntityIdSchema.parse(view.projectId), {
    visibility: 'child',
    lifecycle: 'detail',
    access: 'write',
  });
  if (p.archivedAt !== null)
    throw new ApiFailure('CONFLICT', 'Restore project before changing views');
  const g = guard(s, view.projectId),
    patch: UpdateSavedViewInput = body,
    fields: Record<string, string | number> = { updatedAt: now, lastMutationId: generateId() };
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.type !== undefined) fields.type = patch.type;
  if (patch.filters !== undefined) fields.filtersJson = JSON.stringify(patch.filters);
  const sql = remove
    ? changeSavedViewPredicateSavedViews()
    : changeSavedViewPredicateSavedViewsResult(fields);
  const statements = [changeSavedViewPrepare(r, sql, g, remove, fields, s, id, body)];
  if (!remove) statements.push(changeSavedViewPrepareSavedViews(r, s, id));
  const results = await changeSavedViewCommit(r, statements);
  return remove
    ? { viewId: id }
    : dto(
        required(
          required(results[1], 'Missing projects state').results[0],
          'Missing saved view projection',
        ),
      );
}
