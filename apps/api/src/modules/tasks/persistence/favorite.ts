import type { IdGenerator } from '../../../shared/ids.ts';
import type { TaskProjection } from './model.ts';
import { taskSelect } from './reads.ts';
import { validateRelations } from './relations.ts';
import { relation } from './values.ts';

import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { fitBatch, markerSql } from '../../../db/commands.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { actorParameters, actorSql } from '../../projects/access.ts';

export async function commitFavorite(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  favorite: boolean,
  now: number,
  old: TaskProjection,
  ids: IdGenerator,
) {
  const marker = ids(),
    guard = await validateRelations(r, s, [relation(old, [])]),
    gate = { sql: markerSql('workspaces'), parameters: [s.workspaceId, marker] };
  const statements = [
    r.prepare(
      `UPDATE workspaces SET lastMutationId=? WHERE id=? AND ${actorSql()} AND EXISTS (SELECT 1 FROM tasks WHERE workspaceId=? AND id=? AND version=? AND archivedAt IS NULL AND deletedAt IS NULL) AND ${guard.sql}`,
      [
        marker,
        s.workspaceId,
        ...actorParameters(s),
        s.workspaceId,
        id,
        old.version,
        ...guard.parameters,
      ],
    ),
  ];
  // Bump aggregate version only for an actual favorite change. Idempotent retries stay stable.
  statements.push(
    r.prepare(
      `UPDATE tasks SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND ${favorite ? 'NOT ' : ''}EXISTS (SELECT 1 FROM taskFavorites WHERE workspaceId=? AND memberId=? AND taskId=?) AND ${gate.sql}`,
      [now, marker, s.workspaceId, id, s.workspaceId, s.memberId, id, ...gate.parameters],
    ),
  );
  if (favorite)
    statements.push(
      r.prepare(
        `INSERT OR IGNORE INTO taskFavorites(workspaceId,memberId,taskId,createdAt) SELECT ?,?,?,? WHERE ${gate.sql}`,
        [s.workspaceId, s.memberId, id, now, ...gate.parameters],
      ),
    );
  else
    statements.push(
      r.prepare(
        `DELETE FROM taskFavorites WHERE workspaceId=? AND memberId=? AND taskId=? AND ${gate.sql}`,
        [s.workspaceId, s.memberId, id, ...gate.parameters],
      ),
    );
  statements.push(
    r.prepare(`${taskSelect} WHERE t.workspaceId=? AND t.id=? AND ${gate.sql}`, [
      s.memberId,
      s.memberId,
      s.workspaceId,
      id,
      ...gate.parameters,
    ]),
  );
  fitBatch(r, statements.length, 0);
  const results = await r.batch(statements);
  if (results[0]?.meta.changes !== 1) throw new ApiFailure('CONFLICT', 'Favorite task changed');
  return { taskId: id, isFavorite: favorite };
}
