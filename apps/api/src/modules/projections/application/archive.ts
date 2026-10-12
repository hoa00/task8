import type { ArchiveQuerySchema, ArchiveItemDto } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { textKeyEncoder } from '../../../shared/collation/encoder.ts';
import { bindReadCursor, finishReadPage } from '../../../shared/read-page.ts';
import { taskDto, taskSummaryFromGroups } from '../../tasks/projections.ts';
import { projectCatalogForIds } from '../../projects/projections.ts';
import { today } from '../../workspaces/index.ts';
import { archivePage, archiveTasksByIds, archiveProjectGroups } from '../persistence/archive.ts';
export async function archive(
  repository: RequestRepository,
  scope: WorkspaceContext,
  query: z.infer<typeof ArchiveQuerySchema>,
  now: number,
) {
  const q = textKeyEncoder.lower(query.q.trim()),
    descending = query.kind === 'tasks';
  const { binding, cursor } = await bindReadCursor(
    query,
    { scope, kind: 'archive', entity: query.kind, q },
    descending ? 'updated' : 'title',
    descending ? 'desc' : 'asc',
  );
  const result = await archivePage(repository, scope, query, q, cursor),
    page = finishReadPage(result.rows, result.total, query.limit, binding, (row) => ({
      id: row.id,
      value: row.value,
    })),
    ids = page.items.map((row) => row.id);
  const items = new Map<string, ArchiveItemDto>();
  if (query.kind === 'tasks') {
    if (ids.length)
      for (const row of await archiveTasksByIds(repository, scope, ids)) {
        const task = taskDto(row);
        items.set(task.id, { kind: 'tasks', task });
      }
  } else if (ids.length) {
    const projects = await projectCatalogForIds(repository, scope, now, ids),
      groups = await archiveProjectGroups(
        repository,
        scope,
        ids,
        await today(repository, scope, now),
      );
    for (const project of projects)
      if (project.access === 'allowed')
        items.set(project.project.id, {
          kind: 'projects',
          project: {
            ...project,
            summary: {
              ...project.summary,
              taskSummary: taskSummaryFromGroups(
                groups.filter((group) => group.projectId === project.project.id),
              ),
            },
          },
        });
  }
  return {
    ...page,
    items: page.items.flatMap((row) => {
      const item = items.get(row.id);
      return item ? [item] : [];
    }),
  };
}
