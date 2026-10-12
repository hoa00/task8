import type { SearchQuerySchema, SearchResultDto } from '@studio/contracts/api';
import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { textKeyEncoder } from '../../../shared/collation/encoder.ts';
import { bindReadCursor, finishReadPage } from '../../../shared/read-page.ts';
import { commentDto, reactionsFromJson } from '../../comments/projections.ts';
import { fileDto } from '../../files/projections.ts';
import { memberDto } from '../../members/projections.ts';
import { projectCatalogForIds } from '../../projects/projections.ts';
import { selectedTaskProjections, taskDto } from '../../tasks/projections.ts';
import { searchComments, searchFiles, searchPeople } from '../persistence/search-hydration.ts';
import { searchPage } from '../persistence/search.ts';
export async function search(
  repository: RequestRepository,
  scope: WorkspaceContext,
  query: z.infer<typeof SearchQuerySchema>,
  now: number,
) {
  const q = textKeyEncoder.lower(query.q.trim()),
    { binding, cursor } = await bindReadCursor(
      query,
      { scope, kind: 'search', q, category: query.category },
      'title',
      'asc',
    );
  const selection = await searchPage(repository, scope, query, q, cursor);
  const page = finishReadPage(selection.rows, selection.total, query.limit, binding, (row) => ({
    id: row.id,
    value: row.rank,
  }));
  const ids = (kind: SearchResultDto['kind']) =>
    page.items.filter((item) => item.kind === kind).map((item) => item.id);
  const results = new Map<string, SearchResultDto>();
  const taskIds = ids('tasks');
  if (taskIds.length)
    for (const row of await selectedTaskProjections(repository, scope, {
      kind: 'ids',
      ids: taskIds,
    })) {
      const task = taskDto(row);
      results.set('tasks:' + task.id, { kind: 'tasks', task });
    }
  const projectIds = ids('projects');
  if (projectIds.length)
    for (const project of await projectCatalogForIds(repository, scope, now, projectIds))
      if (project.access === 'allowed')
        results.set('projects:' + project.project.id, { kind: 'projects', project });
  const peopleIds = ids('people');
  if (peopleIds.length)
    for (const row of await searchPeople(repository, scope, peopleIds)) {
      const member = memberDto(row);
      results.set('people:' + member.id, { kind: 'people', member });
    }
  const fileIds = ids('files');
  if (fileIds.length)
    for (const row of await searchFiles(repository, scope, fileIds)) {
      const file = fileDto(row);
      results.set('files:' + file.id, { kind: 'files', file });
    }
  const commentIds = ids('comments');
  if (commentIds.length)
    for (const row of await searchComments(repository, scope, commentIds)) {
      const comment = commentDto(row, reactionsFromJson(row.reactionsJson));
      results.set('comments:' + comment.id, {
        kind: 'comments',
        comment,
        taskKey: row.taskKey,
        taskTitle: row.taskTitle,
      });
    }
  return {
    ...page,
    items: page.items.flatMap((tuple) => {
      const result = results.get(tuple.kind + ':' + tuple.id);
      return result ? [result] : [];
    }),
    totals: selection.totals,
  };
}
