import type { ActivityQuerySchema } from '@studio/contracts/api';
import { ActivitySchema, EntityIdSchema } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { instant } from '../../../shared/clock.ts';
import { bindReadCursor, finishReadPage } from '../../../shared/read-page.ts';
import { member } from '../../members/index.ts';
import { projectRow } from '../../projects/access.ts';
import { taskRow } from '../../tasks/index.ts';
import { pagedActivity } from '../persistence/paged-activity.ts';
export async function listActivity(
  r: RequestRepository,
  s: WorkspaceContext,
  query: z.infer<typeof ActivityQuerySchema>,
) {
  if (query.taskId) await taskRow(r, s, query.taskId);
  if (query.projectId)
    await projectRow(r, s, query.projectId, {
      visibility: 'child',
      lifecycle: 'detail',
      access: 'read',
    });
  if (query.actorId) await member(r, s, query.actorId);
  const { binding, cursor } = await bindReadCursor(
    query,
    {
      scope: s,
      kind: 'activity',
      projectId: query.projectId,
      taskId: query.taskId,
      actorId: query.actorId,
    },
    'updated',
    'desc',
  );
  const { rows, total } = await pagedActivity(r, s, query, cursor);
  const items = rows.map((a) =>
    ActivitySchema.parse({
      id: EntityIdSchema.parse(a.id),
      actorId: a.actorId,
      eventType: a.eventType,
      taskId: a.taskId,
      projectId: a.projectId,
      createdAt: instant(a.createdAt),
      payload: JSON.parse(a.payloadJson),
    }),
  );
  return finishReadPage(items, total, query.limit, binding, (row) => ({
    id: row.id,
    value: row.createdAt,
  }));
}
