import { canReadMockFile } from './file-access.ts';
import { SearchQuerySchema, SearchSchema } from '@studio/contracts/api';
import type { SearchResultDto } from '@studio/contracts/api';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { readDashboardScope } from './dashboards.ts';
import { projectCatalogItem } from './reads.ts';
import { fingerprint } from './task-fields.ts';
import { StudioApiError } from '../errors.ts';

const resultId = (row: SearchResultDto) => `${row.kind}:${row.kind === 'tasks' ? row.task.id : row.kind === 'projects' ? row.project.project.id : row.kind === 'people' ? row.member.id : row.kind === 'files' ? row.file.id : row.comment.id}`;
// One operation owns literal, case-insensitive global search for both surfaces.
// Unlike toolbar search, descriptions and comments participate. Totals are
// computed before category/pagination; private/inactive children never participate.
export async function readSearch(data: MockDataset, input: unknown, clock: Clock) {
  const query = SearchQuerySchema.parse(input), q = query.q.trim().toLowerCase();
  const has = (text: string | undefined | null) => !!q && !!text?.toLowerCase().includes(q);
  const { projects, tasks } = readDashboardScope(data), projectIds = new Set(projects.map(row => row.id)), taskIds = new Set(tasks.map(row => row.id));
  const rows: SearchResultDto[] = [
    ...tasks.filter(task => has(task.title) || has(task.key) || has(data.taskCommands.descriptionTexts[task.id])).map(task => ({ kind: 'tasks' as const, task })),
    ...projects.filter(project => has(project.name) || has(project.description)).map(project => ({ kind: 'projects' as const, project: projectCatalogItem(data, project, clock) })),
    ...Object.values(data.members).filter(member => member.workspaceId === data.workspaceId && (has(member.name) || has(member.email) || has(member.title))).map(member => ({ kind: 'people' as const, member })),
    ...Object.values(data.files).filter(file => canReadMockFile(file, data) && projectIds.has(file.projectId) && (!file.taskId || taskIds.has(file.taskId) && data.tasks[file.taskId]?.projectId === file.projectId) && !data.taskCommands.deletedFiles[file.id] && has(file.name)).map(file => ({ kind: 'files' as const, file })),
    ...Object.values(data.comments).filter(comment => comment.workspaceId === data.workspaceId && taskIds.has(comment.taskId) && !data.taskCommands.deletedComments[comment.id] && has(comment.bodyText)).map(comment => ({ kind: 'comments' as const, comment, taskKey: data.tasks[comment.taskId]!.key, taskTitle: data.tasks[comment.taskId]!.title })),
  ];
  const totals = { tasks: 0, projects: 0, people: 0, files: 0, comments: 0 };
  rows.forEach(row => totals[row.kind]++);
  const filtered = query.category === 'all' ? rows : rows.filter(row => row.kind === query.category);
  const signature = await fingerprint({ workspaceId: data.workspaceId, actorId: data.currentMemberId, q, category: query.category });
  let start = 0;
  if (query.cursor) {
    try {
      const cursor: unknown = JSON.parse(atob(query.cursor.replaceAll('-', '+').replaceAll('_', '/')));
      if (!cursor || typeof cursor !== 'object' || !('signature' in cursor) || cursor.signature !== signature || !('id' in cursor) || typeof cursor.id !== 'string') throw Error('Wrong query');
      const index = filtered.findIndex(row => resultId(row) === cursor.id);
      if (index < 0) throw Error('Result no longer available');
      start = index + 1;
    } catch { throw new StudioApiError({ error: { code: 'VALIDATION_ERROR', message: 'Invalid search cursor or query scope', fieldErrors: { cursor: ['Restart the search.'] } } }); }
  }
  const items = filtered.slice(start, start + query.limit), last = items.at(-1);
  const nextCursor = last && start + items.length < filtered.length ? btoa(JSON.stringify({ signature, id: resultId(last) })).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '') : null;
  return SearchSchema.parse({ items, total: filtered.length, nextCursor, totals });
}
