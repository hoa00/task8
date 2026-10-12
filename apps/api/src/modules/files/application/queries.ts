import type { EntityId, FileQuerySchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { bindReadCursor, finishReadPage } from '../../../shared/read-page.ts';
import { fileDto } from '../mapper.ts';
import { pagedFiles } from '../persistence/paged-files.ts';
import { parent } from './parent.ts';
export async function listFiles(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  q: ReturnType<typeof FileQuerySchema.parse>,
) {
  await parent(r, s, id, null, 'read');
  const { binding, cursor } = await bindReadCursor(
    q,
    { scope: s, kind: 'files', projectId: id, ...q, cursor: undefined, limit: undefined },
    'title',
    'asc',
  );
  const result = await pagedFiles(r, s, id, q, cursor);
  const page = finishReadPage(result.rows, result.total, q.limit, binding, (row) => ({
    id: row.id,
    value: row.readSortValue,
  }));
  return { ...page, items: page.items.map(fileDto) };
}
