import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { actorParameters, projectRow } from '../access.ts';
import {
  favoriteProjectCommitProjectFavorites,
  favoriteProjectPredicateProjects,
  favoriteProjectPrepare,
  favoriteProjectPrepareProjectFavorites,
  projectOrderCommit,
  projectOrderGuardMemberProjectOrder,
  projectOrderGuardProjects,
  projectOrderInsertMemberProjectOrder,
  projectOrderMarkerWorkspaces,
  projectOrderPrepareMemberProjectOrder,
  projectOrderPrepareWorkspaces,
  projectOrderReadMemberProjectOrder,
  projectOrderReadProjects,
} from '../persistence/personal.ts';
export async function favoriteProject(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  add: boolean,
  now: number,
) {
  await projectRow(r, s, id, { visibility: 'child', lifecycle: 'detail', access: 'read' });
  const permitted = favoriteProjectPredicateProjects();
  const parameters = [s.workspaceId, id, s.memberId, ...actorParameters(s)];
  const mutation = add
    ? favoriteProjectPrepare(r, permitted, s, id, now, parameters)
    : favoriteProjectPrepareProjectFavorites(r, permitted, s, id, parameters);
  const results = await favoriteProjectCommitProjectFavorites(r, mutation, s, id);
  const row = required(results[1], 'Missing projects state').results[0];
  if (!row) throw new ApiFailure('NOT_FOUND', 'Project not found');
  if (!row.authorized || !!row.favorite !== add)
    throw new ApiFailure('CONFLICT', 'Project favorite authorization changed');
  return { projectId: id, isFavorite: !!row.favorite };
}
export async function projectOrder(
  r: RequestRepository,
  s: WorkspaceContext,
  projectIds: EntityId[],
  generateId: IdGenerator = newId,
) {
  // Restricted cards are known catalog roots and may be ordered, without exposing
  // their children. Archived/deleted/foreign IDs are never order candidates.
  const catalog = await projectOrderReadProjects(r, s);
  if (projectIds.some((id) => !catalog.some((p) => p.id === id)))
    throw new ApiFailure('VALIDATION_ERROR', 'Choose known active catalog projects');
  const old = await projectOrderReadMemberProjectOrder(r, s);
  const requested = new Set<string>(projectIds),
    active = new Set(catalog.map((p) => p.id)),
    rest = [
      ...old.filter((p) => active.has(p.projectId)).map((p) => p.projectId),
      ...catalog.map((p) => p.id),
    ].filter((id, index, all) => !requested.has(id) && all.indexOf(id) === index);
  const rows = [...projectIds, ...rest].map((projectId, index) => ({
    workspaceId: s.workspaceId,
    memberId: s.memberId,
    projectId,
    position: index * 100,
  }));
  const orders = projectOrderGuardMemberProjectOrder(s, old),
    projects = projectOrderGuardProjects(s, catalog);
  const marker = generateId(),
    gate = { sql: projectOrderMarkerWorkspaces(), parameters: [s.workspaceId, marker] },
    statements = [
      projectOrderPrepareWorkspaces(r, orders, projects, marker, s),
      projectOrderPrepareMemberProjectOrder(r, gate, s),
    ];
  if (rows.length) statements.push(projectOrderInsertMemberProjectOrder(r, rows, gate));
  await projectOrderCommit(r, statements);
  return { projectIds };
}
