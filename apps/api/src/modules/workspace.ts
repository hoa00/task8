import type {
  EntityId,
  MemberDto,
  UpdateProfileInput,
  UpdateWorkspaceInput,
} from '@studio/contracts/api';
import { UserProfileSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/client.ts';
import { fitBatch, markerSql, matchedBatch, patchSql } from '../db/commands.ts';
import type { users, workspaces } from '../db/schema.ts';
import { ApiFailure } from '../shared/errors.ts';
import { newId } from '../shared/ids.ts';
import { workspaceDto } from './bootstrap.ts';
import { actorParameters, actorSql, administrator } from './projects/index.ts';
export async function readWorkspace(r: RequestRepository, id: EntityId) {
  const [row] = await r.all<typeof workspaces.$inferSelect>('SELECT * FROM workspaces WHERE id=?', [
    id,
  ]);
  if (!row) throw new ApiFailure('NOT_FOUND', 'Workspace not found');
  return workspaceDto({ ...row, brand: !!row.brand });
}
export async function updateWorkspace(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  body: UpdateWorkspaceInput,
  now: number,
) {
  administrator(actor);
  const { expectedVersion, ...patch } = body,
    fields = patchSql({ ...patch, updatedAt: now, lastMutationId: newId() });
  if (
    patch.slug &&
    (await r.all('SELECT id FROM workspaces WHERE slug=? AND id!=?', [patch.slug, s.workspaceId]))
      .length
  )
    throw new ApiFailure('CONFLICT', 'Workspace slug exists');
  const guard = patch.slug
    ? 'AND NOT EXISTS (SELECT 1 FROM workspaces other WHERE other.slug=? AND other.id!=?)'
    : '';
  const statement = r.prepare(
    `UPDATE workspaces SET ${fields.sql},version=version+1 WHERE id=? AND version=? AND ${actorSql('administrator')} ${guard}`,
    [
      ...fields.parameters,
      s.workspaceId,
      expectedVersion,
      ...actorParameters(s),
      ...(patch.slug ? [patch.slug, s.workspaceId] : []),
    ],
  );
  fitBatch(r, 1, 1);
  await matchedBatch(r, [statement]);
  return readWorkspace(r, s.workspaceId);
}
export async function updateProfile(
  r: RequestRepository,
  userId: EntityId,
  workspaceId: EntityId,
  body: UpdateProfileInput,
  now: number,
) {
  const { expectedVersion, ...patch } = body,
    marker = newId(),
    fields = patchSql({ ...patch, updatedAt: now, lastMutationId: marker });
  fitBatch(r, 2, 1);
  await matchedBatch(r, [
    r.prepare(
      `UPDATE users SET ${fields.sql},version=version+1 WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM workspaceMembers m WHERE m.userId=users.id AND m.workspaceId=? AND m.status='active' AND m.removedAt IS NULL)`,
      [...fields.parameters, userId, expectedVersion, workspaceId],
    ),
    r.prepare(
      `UPDATE workspaceMembers SET version=version+1,updatedAt=?,lastMutationId=? WHERE userId=? AND ${markerSql('users')}`,
      [now, marker, userId, userId, marker],
    ),
  ]);
  const [u] = await r.all<typeof users.$inferSelect>('SELECT * FROM users WHERE id=?', [userId]);
  return UserProfileSchema.parse({
    id: u!.id,
    name: u!.name,
    email: u!.displayEmail,
    title: u!.title,
    avatarColor: u!.avatarColor,
    timezone: u!.timezone,
    version: u!.version,
  });
}
