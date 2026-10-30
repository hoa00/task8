import { z } from 'zod';
import type { RequestRepository } from '../../../db/client.ts';
import { transactionInvalid, type LoginTransaction } from '../domain/oidc-browser.ts';
import { sqlNow } from './oidc-clock-sql.ts';
const Login = z.object({
  id: z.string(),
  stateHash: z.string(),
  bindingHash: z.string(),
  secret: z.string(),
  issuer: z.string(),
  clientId: z.string(),
  redirectUri: z.string(),
  returnTo: z.string(),
  priorHash: z.string().nullable(),
  createdAt: z.number(),
  expiresAt: z.number(),
  status: z.enum(['pending', 'claimed', 'succeeded', 'failed']),
});
export function oidcBrowserStore(
  repository: RequestRepository,
  config: { issuer: string; clientId: string; origin: string },
) {
  const live = `expiresAt>${sqlNow} AND createdAt<=${sqlNow} AND createdAt+600000>${sqlNow}`;
  return {
    async insert(row: LoginTransaction) {
      await repository
        .prepare(
          'INSERT INTO oidcLoginTransactions(id,stateHash,bindingHash,secret,issuer,clientId,redirectUri,returnTo,priorHash,createdAt,expiresAt,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
          [
            row.id,
            row.stateHash,
            row.bindingHash,
            row.secret,
            row.issuer,
            row.clientId,
            row.redirectUri,
            row.returnTo,
            row.priorHash,
            row.createdAt,
            row.expiresAt,
            row.status,
          ],
        )
        .run();
    },
    async claim(stateHash: string, bindingHash: string, priorHash: string | null) {
      const [row] = await repository.all(
        `UPDATE oidcLoginTransactions SET status='claimed' WHERE stateHash=? AND bindingHash=? AND priorHash IS ? AND status='pending' AND ${live} AND issuer=? AND clientId=? AND redirectUri=? RETURNING *`,
        [
          stateHash,
          bindingHash,
          priorHash,
          config.issuer,
          config.clientId,
          config.origin + '/auth/callback',
        ],
      );
      if (!row) throw transactionInvalid();
      return Login.parse(row);
    },
    async claimed(id: string) {
      return (
        (
          await repository.all(
            `SELECT id FROM oidcLoginTransactions WHERE id=? AND status='claimed' AND ${live}`,
            [id],
          )
        ).length === 1
      );
    },
    async fail(id: string) {
      await repository
        .prepare(
          "UPDATE oidcLoginTransactions SET status='failed',secret='' WHERE id=? AND status='claimed'",
          [id],
        )
        .run();
    },
    async logout(stateHash: string, bindingHash: string, expiresAt: number) {
      await repository
        .prepare(
          'INSERT INTO oidcLogoutTransactions(stateHash,bindingHash,expiresAt) VALUES(?,?,?)',
          [stateHash, bindingHash, expiresAt],
        )
        .run();
    },
    async complete(stateHash: string, bindingHash: string, now: number) {
      return (
        (
          await repository.all(
            `UPDATE oidcLogoutTransactions SET consumedAt=? WHERE stateHash=? AND bindingHash=? AND consumedAt IS NULL AND expiresAt>${sqlNow} RETURNING stateHash`,
            [now, stateHash, bindingHash],
          )
        ).length === 1
      );
    },
  };
}
