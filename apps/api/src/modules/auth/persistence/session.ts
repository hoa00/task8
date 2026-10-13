import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { sessionRecord, type SessionRecord } from '../domain/session.ts';
const select = `SELECT s.*,i.subject,i.tenant FROM authSessions s JOIN authIdentities i ON i.id=s.identityId AND i.userId=s.userId`;
export interface EncryptedPair {
  accessCiphertext: string;
  refreshCiphertext: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}
async function storage<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Session storage is unavailable');
  }
}
export async function findSession(
  repository: RequestRepository,
  field: 'sidHash' | 'id',
  value: string,
): Promise<SessionRecord | undefined> {
  const [row] = await storage(() =>
    repository.all<unknown>(`${select} WHERE s.${field}=? LIMIT 1`, [value]),
  );
  return row === undefined ? undefined : sessionRecord(row);
}
export async function insertSession(
  repository: RequestRepository,
  record: SessionRecord,
  previous: SessionRecord | undefined,
): Promise<boolean> {
  const previousGuard = previous
    ? 'EXISTS (SELECT 1 FROM authSessions WHERE id=? AND authGeneration=? AND revokedAt IS ?)'
    : '1';
  const guards = previous ? [previous.id, previous.authGeneration, previous.revokedAt] : [];
  const writes = [
    repository.prepare(
      `INSERT INTO authSessions (id,sidHash,identityId,userId,accessCiphertext,refreshCiphertext,accessExpiresAt,refreshExpiresAt,expiresAt,tokenVersion,authGeneration,createdAt,revokedAt)
    SELECT ?,?,?,?,?,?,?,?,?,1,1,?,NULL WHERE ${previousGuard}`,
      [
        record.id,
        record.sidHash,
        record.identityId,
        record.userId,
        record.accessCiphertext,
        record.refreshCiphertext,
        record.accessExpiresAt,
        record.refreshExpiresAt,
        record.expiresAt,
        record.createdAt,
        ...guards,
      ],
    ),
  ];
  if (previous)
    writes.push(
      repository.prepare(
        `UPDATE authSessions SET revokedAt=?,accessCiphertext=NULL,refreshCiphertext=NULL,tokenVersion=tokenVersion+1,authGeneration=authGeneration+1
    WHERE id=? AND authGeneration=? AND revokedAt IS ? AND EXISTS(SELECT 1 FROM authSessions WHERE id=? AND sidHash=?)`,
        [
          record.createdAt,
          previous.id,
          previous.authGeneration,
          previous.revokedAt,
          record.id,
          record.sidHash,
        ],
      ),
    );
  try {
    const result = await repository.batch(writes);
    return (result[0]?.meta.changes ?? 0) === 1;
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    // Reconcile a lost native batch acknowledgement once by the owned new ID.
    const actual = await findSession(repository, 'id', record.id);
    if (
      actual?.sidHash === record.sidHash &&
      actual.revokedAt === null &&
      actual.authGeneration === 1
    )
      return true;
    throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Session storage is unavailable');
  }
}
export async function replacePair(
  repository: RequestRepository,
  record: SessionRecord,
  pair: EncryptedPair,
  now: number,
): Promise<boolean> {
  const results = await storage(() =>
    repository.batch([
      repository.prepare(
        `UPDATE authSessions SET accessCiphertext=?,refreshCiphertext=?,accessExpiresAt=?,refreshExpiresAt=?,tokenVersion=tokenVersion+1
    WHERE id=? AND tokenVersion=? AND authGeneration=? AND revokedAt IS NULL AND expiresAt>? AND refreshExpiresAt>?`,
        [
          pair.accessCiphertext,
          pair.refreshCiphertext,
          pair.accessExpiresAt,
          pair.refreshExpiresAt,
          record.id,
          record.tokenVersion,
          record.authGeneration,
          now,
          now,
        ],
      ),
    ]),
  );
  return (results[0]?.meta.changes ?? 0) === 1;
}
export async function revokeSession(
  repository: RequestRepository,
  id: EntityId,
  now: number,
  version?: number,
): Promise<boolean> {
  const results = await storage(() =>
    repository.batch([
      repository.prepare(
        `UPDATE authSessions SET revokedAt=?,accessCiphertext=NULL,refreshCiphertext=NULL,tokenVersion=tokenVersion+1,authGeneration=authGeneration+1
    WHERE id=? AND revokedAt IS NULL${version === undefined ? '' : ' AND tokenVersion=?'}`,
        [now, id, ...(version === undefined ? [] : [version])],
      ),
    ]),
  );
  return (results[0]?.meta.changes ?? 0) === 1;
}
