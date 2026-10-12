import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import type { commandUndoRecords } from '../../../db/schema.ts';
export type UndoRecord = typeof commandUndoRecords.$inferSelect;
export async function readUndoRecord(r: RequestRepository, s: WorkspaceContext, id: EntityId) {
  return (
    await r.all<UndoRecord>(
      'SELECT * FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=?',
      [s.workspaceId, id, s.memberId],
    )
  )[0];
}
