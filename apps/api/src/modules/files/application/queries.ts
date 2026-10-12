import type { EntityId, FileQuerySchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { projectionPage } from '../../projection-page.ts';
import { fileDto } from '../mapper.ts';
import type { FileRow } from '../persistence/model.ts';
import { listFilesReadFiles } from '../persistence/queries.ts';
import { parent } from './parent.ts';
export async function listFiles(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
  q: ReturnType<typeof FileQuerySchema.parse>,
) {
  await parent(r, s, id, null, 'read');
  const rows = await listFilesReadFiles(r, s, id);
  const selected = rows.filter(
    (f) =>
      (!q.q || f.name.toLowerCase().includes(q.q.toLowerCase())) &&
      (!q.type || f.fileType === q.type),
  );
  const value = (f: FileRow) =>
    q.sort === 'recent'
      ? -f.createdAt
      : q.sort === 'size'
        ? -(f.sizeBytes ?? -1)
        : q.sort === 'type'
          ? f.fileType
          : f.name;
  selected.sort((a, b) => {
    const av = value(a),
      bv = value(b);
    return (
      (typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))) || a.id.localeCompare(b.id)
    );
  });
  const page = await projectionPage(
    selected,
    q,
    { scope: s, kind: 'files', projectId: id, ...q, cursor: undefined, limit: undefined },
    value,
  );
  return { ...page, items: page.items.map(fileDto) };
}
