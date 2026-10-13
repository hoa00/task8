import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository } from '../src/db/client.ts';

const requiredTables = ['users', 'authIdentities'] as const;
export interface IdentityLinkStorage {
  missingTables: (typeof requiredTables)[number][];
  userExists: boolean;
}

// Local operator preflight only. The members use-case still owns the guarded write.
export async function inspectIdentityLinkStorage(
  repository: RequestRepository,
  userId: EntityId,
): Promise<IdentityLinkStorage> {
  const tables = await repository.all<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type='table' AND name IN ('users','authIdentities') LIMIT 2`,
    [],
  );
  const missingTables = requiredTables.filter((name) => !tables.some((row) => row.name === name));
  if (missingTables.length) return { missingTables, userExists: false };
  const users = await repository.all<{ id: EntityId }>('SELECT id FROM users WHERE id=? LIMIT 1', [
    userId,
  ]);
  return { missingTables, userExists: users.length === 1 };
}
