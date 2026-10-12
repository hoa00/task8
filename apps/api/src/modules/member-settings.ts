import { MemberPreferencesSchema, NotificationPreferencesSchema } from '@studio/contracts/api';
import { ApiFailure } from '../errors.ts';
import { actorParameters, actorSql } from './shared.ts';
import type {
  UpdatePreferencesInput,
  UpdateNotificationPreferencesInput,
} from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
// JSON patch merges only parsed keys at SQL execution time, preserving concurrent
// unrelated fields and the other preference document. There is no client scope.
export async function preferences(
  r: RequestRepository,
  s: WorkspaceContext,
  notification: boolean,
  patch?: UpdatePreferencesInput | UpdateNotificationPreferencesInput,
  now = 0,
) {
  const column = notification ? 'notificationPreferencesJson' : 'preferencesJson';
  let rows: Record<string, unknown>[];
  if (patch) {
    const results = await r.batch([
      r.prepare(
        `UPDATE memberPreferences SET ${column}=json_patch(${column},?),updatedAt=? WHERE workspaceId=? AND memberId=? AND ${actorSql()}`,
        [JSON.stringify(patch), now, s.workspaceId, s.memberId, ...actorParameters(s)],
      ),
      r.prepare(
        `SELECT ${column} value FROM memberPreferences WHERE workspaceId=? AND memberId=?`,
        [s.workspaceId, s.memberId],
      ),
    ]);
    if (results[0]!.meta.changes !== 1)
      throw new ApiFailure('CONFLICT', 'Preference membership changed');
    rows = results[1]!.results as Record<string, unknown>[];
  } else
    rows = await r.all(
      `SELECT ${column} value FROM memberPreferences WHERE workspaceId=? AND memberId=?`,
      [s.workspaceId, s.memberId],
    );
  if (!rows[0]) throw new ApiFailure('NOT_FOUND', 'Preferences not found');
  const value = JSON.parse(String(rows[0].value));
  return notification
    ? NotificationPreferencesSchema.parse(value)
    : MemberPreferencesSchema.parse(value);
}
