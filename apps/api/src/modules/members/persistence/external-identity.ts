import type { EntityId, UserProfileDto } from '@studio/contracts/api';
import type { RequestRepository } from '../../../db/client.ts';
import type { users } from '../../../db/schema.ts';
import { textKeyEncoder } from '../../../shared/collation/encoder.ts';
import type { ExternalProfile } from '../domain/bootstrap-profile.ts';
import { profileReadTextKeys } from '../domain/read-text.ts';

export type IdentityProfileRow = typeof users.$inferSelect & { identityId: string };
const projection = `SELECT u.*,i.id identityId FROM authIdentities i JOIN users u ON u.id=i.userId
  WHERE i.providerKey=? AND i.tenant=? AND i.subject=? LIMIT 1`;
export async function ensureIdentityProfile(
  repository: RequestRepository,
  identity: ExternalProfile,
  candidate: UserProfileDto,
  identityId: EntityId,
  marker: EntityId,
  now: number,
): Promise<IdentityProfileRow | undefined> {
  const key = [identity.providerKey, identity.tenant, identity.subject];
  const rows = await repository.batch<IdentityProfileRow>([
    repository.prepare(
      `INSERT INTO users (id,name,emailNormalized,displayEmail,title,avatarColor,timezone,createdAt,updatedAt,version,lastMutationId,readKeys)
      SELECT ?,?,?,?,?,?,?,?,?,1,?,?
      WHERE NOT EXISTS (SELECT 1 FROM authIdentities WHERE providerKey=? AND tenant=? AND subject=?)
        AND NOT EXISTS (SELECT 1 FROM users WHERE emailNormalized=?)`,
      [
        candidate.id,
        candidate.name,
        candidate.email.trim().toLowerCase(),
        candidate.email,
        candidate.title,
        candidate.avatarColor,
        candidate.timezone,
        now,
        now,
        marker,
        profileReadTextKeys(
          { name: candidate.name, displayEmail: candidate.email, title: candidate.title },
          textKeyEncoder,
        ),
        ...key,
        candidate.email.trim().toLowerCase(),
      ],
    ),
    repository.prepare(
      `INSERT INTO authIdentities (id,providerKey,tenant,subject,userId,createdAt)
      SELECT ?,?,?,?,u.id,? FROM users u WHERE u.id=? AND u.lastMutationId=?`,
      [identityId, ...key, now, candidate.id, marker],
    ),
    repository.prepare(projection, key),
  ]);
  return rows[2]?.results[0];
}
export async function linkIdentity(
  repository: RequestRepository,
  identity: Pick<ExternalProfile, 'providerKey' | 'tenant' | 'subject'>,
  userId: EntityId,
  identityId: EntityId,
  now: number,
) {
  const key = [identity.providerKey, identity.tenant, identity.subject];
  const rows = await repository.batch<{ id: string; userId: string }>([
    repository.prepare(
      `INSERT INTO authIdentities (id,providerKey,tenant,subject,userId,createdAt)
      SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM users WHERE id=?)
        AND NOT EXISTS (SELECT 1 FROM authIdentities WHERE providerKey=? AND tenant=? AND subject=?)`,
      [identityId, ...key, userId, now, userId, ...key],
    ),
    repository.prepare(
      'SELECT id,userId FROM authIdentities WHERE providerKey=? AND tenant=? AND subject=? LIMIT 1',
      key,
    ),
  ]);
  return rows[1]?.results[0];
}
