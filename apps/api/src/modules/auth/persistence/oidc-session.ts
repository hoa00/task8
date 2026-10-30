import type { LoginCommit } from '../domain/oidc-browser.ts';
import { z } from 'zod';
import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository, SqlValue } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { OidcSessionRecord } from '../domain/oidc.ts';
const RecordSchema = z.object({
  id: EntityIdSchema,
  linkId: EntityIdSchema,
  userId: EntityIdSchema,
  issuer: z.string(),
  subject: z.string(),
  clientId: z.string(),
  providerSid: z.string(),
  sidHash: z.string(),
  bundle: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
  authorityValidatedAt: z.number(),
  accessExpiresAt: z.number(),
  revokedAt: z.number().nullable(),
  revision: z.number().int().positive(),
  leaseOwner: z.string().nullable(),
  leaseUntil: z.number(),
  refreshInput: z.string().nullable(),
  refreshAttemptAt: z.number(),
});
import { sqlNow } from './oidc-clock-sql.ts';
const localBinding = `EXISTS(SELECT 1 FROM oidcIdentityLinks l JOIN users u ON u.id=l.userId WHERE l.id=oidcAppSessions.linkId AND l.userId=oidcAppSessions.userId AND l.issuer=oidcAppSessions.issuer AND l.subject=oidcAppSessions.subject AND l.status='active')`;
async function storage<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Session storage is unavailable');
  }
}
export function oidcSessionStore(repository: RequestRepository, issuer: string, clientId: string) {
  async function rows(
    sql: string,
    params: readonly SqlValue[],
  ): Promise<OidcSessionRecord | undefined> {
    return storage(async () => {
      const [row] = await repository.all<unknown>(sql, params);
      return row === undefined ? undefined : RecordSchema.parse(row);
    });
  }
  const alive = `revokedAt IS NULL AND expiresAt>${sqlNow} AND createdAt+28800000>${sqlNow} AND createdAt<=${sqlNow} AND ${localBinding}`;
  const ownership = `id=? AND revision=? AND leaseOwner=? AND refreshInput=? AND refreshAttemptAt=? AND revokedAt IS NULL`;
  const owned = (row: OidcSessionRecord, owner: string) => [
    row.id,
    row.revision,
    owner,
    row.refreshInput,
    row.refreshAttemptAt,
  ];
  return {
    async link(subject: string) {
      return storage(async () => {
        const [row] = await repository.all<{ id: string; userId: string }>(
          `SELECT l.id,l.userId FROM oidcIdentityLinks l JOIN users u ON u.id=l.userId WHERE l.issuer=? AND l.subject=? AND l.status='active'`,
          [issuer, subject],
        );
        return row
          ? { id: EntityIdSchema.parse(row.id), userId: EntityIdSchema.parse(row.userId) }
          : undefined;
      });
    },
    current(hash: string) {
      return rows(
        `SELECT * FROM oidcAppSessions WHERE sidHash=? AND issuer=? AND clientId=? AND ${alive}`,
        [hash, issuer, clientId],
      );
    },
    async insert(row: OidcSessionRecord, commit?: LoginCommit) {
      const values = [
        row.id,
        row.sidHash,
        row.linkId,
        row.userId,
        row.issuer,
        row.subject,
        row.clientId,
        row.providerSid,
        row.bundle,
        row.createdAt,
        row.expiresAt,
        row.authorityValidatedAt,
        row.accessExpiresAt,
      ];
      const predicate = `EXISTS(SELECT 1 FROM oidcIdentityLinks l JOIN users u ON u.id=l.userId WHERE l.id=? AND l.userId=? AND l.issuer=? AND l.subject=? AND l.status='active') AND ?<=${sqlNow} AND ${sqlNow}<?`;
      const params = [
        ...values,
        row.linkId,
        row.userId,
        issuer,
        row.subject,
        row.createdAt,
        row.authorityValidatedAt + 300000,
      ];
      const transaction = `EXISTS(SELECT 1 FROM oidcLoginTransactions t WHERE t.id=? AND t.status='claimed' AND t.priorHash IS ? AND t.issuer=? AND t.clientId=? AND t.createdAt<=${sqlNow} AND t.expiresAt>${sqlNow} AND t.createdAt+600000>${sqlNow})`;
      const insert = `INSERT INTO oidcAppSessions(id,sidHash,linkId,userId,issuer,subject,clientId,providerSid,bundle,createdAt,expiresAt,authorityValidatedAt,accessExpiresAt) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${predicate}`;
      if (!commit) return !!(await rows(insert + ' RETURNING *', params));
      const inserted = repository.prepare(insert + ' AND ' + transaction + ' RETURNING *', [
        ...params,
        commit.id,
        commit.priorHash,
        issuer,
        clientId,
      ]);
      // Dependent writes require this attempt's newly generated session, never changes() from an unrelated statement.
      const winner = `EXISTS(SELECT 1 FROM oidcAppSessions s WHERE s.id=? AND s.sidHash=? AND s.revokedAt IS NULL)`;
      const results = await repository.batch([
        inserted,
        repository.prepare(
          `UPDATE oidcLoginTransactions SET status='succeeded',secret='' WHERE id=? AND status='claimed' AND ${winner}`,
          [commit.id, row.id, row.sidHash],
        ),
        repository.prepare(
          `UPDATE oidcAppSessions SET revokedAt=?,bundle='',revision=revision+1,leaseOwner=NULL,leaseUntil=0,refreshInput=NULL,refreshAttemptAt=0 WHERE sidHash=? AND issuer=? AND clientId=? AND revokedAt IS NULL AND EXISTS(SELECT 1 FROM oidcLoginTransactions t WHERE t.id=? AND t.status='succeeded' AND ${winner})`,
          [row.createdAt, commit.priorHash, issuer, clientId, commit.id, row.id, row.sidHash],
        ),
      ]);
      return results[0]?.results.length === 1 && results[1]?.meta.changes === 1;
    },
    claim(row: OidcSessionRecord, owner: string) {
      return rows(
        `UPDATE oidcAppSessions SET leaseOwner=?,leaseUntil=${sqlNow}+10000 WHERE id=? AND revision=? AND ${alive} AND (leaseOwner IS NULL OR leaseUntil<=${sqlNow}) RETURNING *`,
        [owner, row.id, row.revision],
      );
    },
    mark(row: OidcSessionRecord, owner: string) {
      return rows(
        `UPDATE oidcAppSessions SET refreshInput=bundle,refreshAttemptAt=${sqlNow} WHERE id=? AND revision=? AND leaseOwner=? AND refreshInput IS NULL AND ${alive} RETURNING *`,
        [row.id, row.revision, owner],
      );
    },
    release(row: OidcSessionRecord, owner: string, clear: boolean) {
      return rows(
        `UPDATE oidcAppSessions SET ${clear ? 'refreshInput=NULL,refreshAttemptAt=0,' : ''}leaseOwner=NULL,leaseUntil=0 WHERE ${ownership} AND ${alive} RETURNING *`,
        owned(row, owner),
      );
    },
    commit(
      row: OidcSessionRecord,
      owner: string,
      bundle: string,
      started: number,
      accessExpiresAt: number,
    ) {
      return rows(
        `UPDATE oidcAppSessions SET bundle=?,revision=revision+1,authorityValidatedAt=?,accessExpiresAt=?,leaseOwner=NULL,leaseUntil=0,refreshInput=NULL,refreshAttemptAt=0 WHERE ${ownership} AND ${alive} AND ?<=${sqlNow} AND ${sqlNow}<? RETURNING *`,
        [bundle, started, accessExpiresAt, ...owned(row, owner), started, started + 300000],
      );
    },
    revokeOwned(row: OidcSessionRecord, owner: string, now: number) {
      return rows(
        `UPDATE oidcAppSessions SET revokedAt=?,bundle='',revision=revision+1,leaseOwner=NULL,leaseUntil=0,refreshInput=NULL,refreshAttemptAt=0 WHERE ${ownership} RETURNING *`,
        [now, ...owned(row, owner)],
      );
    },
    revoke(hash: string, now: number) {
      return rows(
        `UPDATE oidcAppSessions SET revokedAt=?,bundle='',revision=revision+1,leaseOwner=NULL,leaseUntil=0,refreshInput=NULL,refreshAttemptAt=0 WHERE sidHash=? AND issuer=? AND clientId=? AND revokedAt IS NULL RETURNING *`,
        [now, hash, issuer, clientId],
      );
    },
  };
}
