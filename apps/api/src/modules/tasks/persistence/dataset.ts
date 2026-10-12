import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { members } from '../../members/index.ts';
import { readAccessSql as accessSql } from '../../projects/index.ts';
import { today } from '../../workspaces/index.ts';
import type { TaskProjection } from './model.ts';
import { taskSelect } from './reads.ts';

export async function taskDataset(r: RequestRepository, s: WorkspaceContext, now: number) {
  const rows = await r.all<TaskProjection>(
    `${taskSelect} WHERE t.workspaceId=? AND t.deletedAt IS NULL AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${accessSql}`,
    [s.memberId, s.memberId, s.workspaceId, s.memberId],
  );
  const ms = await members(r, s),
    ps = await r.all<{ id: EntityId; name: string; color: string }>(
      `SELECT p.id,p.name,p.color FROM projects p WHERE p.workspaceId=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql}`,
      [s.workspaceId, s.memberId],
    );
  return {
    rows,
    env: { today: await today(r, s, now), now, lookups: { members: ms, projects: ps } },
  };
}
