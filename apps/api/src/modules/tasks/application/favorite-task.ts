import type { TaskFavoriteDto } from '@studio/contracts/api';
import type { IdGenerator } from '../../../shared/ids.ts';
import { newId } from '../../../shared/ids.ts';
import { commitFavorite } from '../persistence/favorite.ts';
import { taskRow } from '../persistence/reads.ts';
import { active } from './planning.ts';

import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';

export async function favoriteTask(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  favorite: boolean,
  now: number,
  ids: IdGenerator = newId,
): Promise<TaskFavoriteDto> {
  const old = await taskRow(r, s, id);
  active(old);
  return commitFavorite(r, s, id, favorite, now, old, ids);
}
