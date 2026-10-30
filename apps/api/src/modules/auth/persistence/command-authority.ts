import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository, SqlValue } from '../../../db/client.ts';
import type { CommandAuthority } from '../../../shared/scope.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { sqlNow } from './oidc-clock-sql.ts';
const unavailable = () =>
  new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Current authentication authority is unavailable');
const alive = `s.revokedAt IS NULL AND s.createdAt<=${sqlNow} AND s.expiresAt>${sqlNow} AND s.createdAt+28800000>${sqlNow} AND l.status='active'`;
const fresh = `s.authorityValidatedAt<=${sqlNow} AND ${sqlNow}-s.authorityValidatedAt<300000`;
const relation = `oidcAppSessions s JOIN oidcIdentityLinks l ON l.id=s.linkId AND l.userId=s.userId AND l.issuer=s.issuer AND l.subject=s.subject JOIN users u ON u.id=s.userId`;
export function principalAuthorityParameters(authority: CommandAuthority): SqlValue[] {
  if (!authority || !['local', 'ict24h', 'oidc'].includes(authority.kind)) throw unavailable();
  if (authority.kind !== 'oidc') return [null, null, null, null, null];
  if (
    !EntityIdSchema.safeParse(authority.sessionId).success ||
    !EntityIdSchema.safeParse(authority.userId).success ||
    !authority.issuer ||
    !authority.clientId
  )
    throw unavailable();
  return [
    authority.sessionId,
    authority.sessionId,
    authority.userId,
    authority.issuer,
    authority.clientId,
  ];
}
// Column names are a closed internal allowlist, never request input.
export function principalAuthoritySql(userColumn: 'actor.userId' | 'users.id'): string {
  return `(? IS NULL OR EXISTS(SELECT 1 FROM ${relation} WHERE s.id=? AND s.userId=? AND s.issuer=? AND s.clientId=? AND s.userId=${userColumn} AND ${alive} AND ${fresh}))`;
}
export async function currentCommandAuthority(
  repository: RequestRepository,
  authority: CommandAuthority,
): Promise<'valid' | 'invalid' | 'stale'> {
  principalAuthorityParameters(authority);
  if (authority.kind !== 'oidc') return 'valid';
  try {
    const [row] = await repository.all<{ fresh: number }>(
      `SELECT CASE WHEN ${fresh} THEN 1 ELSE 0 END fresh FROM ${relation} WHERE s.id=? AND s.userId=? AND s.issuer=? AND s.clientId=? AND ${alive} LIMIT 1`,
      [authority.sessionId, authority.userId, authority.issuer, authority.clientId],
    );
    if (!row) return 'invalid';
    if (row.fresh === 1) return 'valid';
    if (row.fresh === 0) return 'stale';
    throw unavailable();
  } catch {
    throw unavailable();
  }
}
