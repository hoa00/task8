import { ArchiveQuerySchema } from '@studio/contracts/api';
import type { ArchiveItemDto } from '@studio/contracts/api';
import type { Clock } from '@studio/domain';
import { summarizeTasks } from '@studio/domain';
import { StudioApiError } from '../errors.ts';
import type { MockDataset } from './dataset.ts';
import { canReadMockProject } from './project-access.ts';
import { projectCatalogItem } from './reads.ts';
import { fingerprint, projectTask } from './task-fields.ts';

export async function readArchive(data: MockDataset, input: unknown, clock: Clock) {
  const query = ArchiveQuerySchema.parse(input),
    q = query.q.trim().toLowerCase();
  const rows: ArchiveItemDto[] =
    query.kind === 'tasks'
      ? Object.values(data.tasks)
          .filter(
            (task) =>
              task.workspaceId === data.workspaceId &&
              !!task.archivedAt &&
              !data.taskCommands.deletedTasks[task.id] &&
              canReadMockProject(data.projects[task.projectId], data) &&
              !data.projects[task.projectId]!.archivedAt &&
              (!q || `${task.title} ${task.key}`.toLowerCase().includes(q)),
          )
          .map((task) => ({ kind: 'tasks', task: projectTask(task, data) }))
      : Object.values(data.projects)
          .filter(
            (project) =>
              !!project.archivedAt &&
              canReadMockProject(project, data) &&
              (!q || project.name.toLowerCase().includes(q)),
          )
          .map((project) => {
            const item = projectCatalogItem(data, project, clock);
            if (item.access !== 'allowed')
              throw Error('Archive must not disclose a restricted project');
            // Archive's count includes archived children, but never deleted tombstones.
            const taskSummary = summarizeTasks(
              Object.values(data.tasks).filter(
                (task) =>
                  task.workspaceId === data.workspaceId &&
                  task.projectId === project.id &&
                  !data.taskCommands.deletedTasks[task.id],
              ),
              clock.today(),
            );
            return {
              kind: 'projects',
              project: { ...item, summary: { ...item.summary, taskSummary } },
            };
          });
  const entity = (row: ArchiveItemDto) => (row.kind === 'tasks' ? row.task : row.project.project);
  const archivedAt = (row: ArchiveItemDto) => {
    const value = entity(row);
    return 'archivedAt' in value ? (value.archivedAt ?? '') : '';
  };
  const rank = (row: ArchiveItemDto) => Object.keys(data.projects).indexOf(entity(row).id);
  rows.sort((a, b) =>
    query.kind === 'tasks'
      ? archivedAt(b).localeCompare(archivedAt(a)) || entity(a).id.localeCompare(entity(b).id)
      : rank(a) - rank(b) || entity(a).id.localeCompare(entity(b).id),
  );
  const signature = await fingerprint({
    workspaceId: data.workspaceId,
    memberId: data.currentMemberId,
    kind: query.kind,
    q,
  });
  let start = 0;
  if (query.cursor) {
    try {
      const anchor = JSON.parse(atob(query.cursor.replaceAll('-', '+').replaceAll('_', '/'))) as {
        signature: string;
        id: string;
        at: string;
        rank: number;
      };
      if (
        anchor.signature !== signature ||
        typeof anchor.id !== 'string' ||
        typeof anchor.at !== 'string'
      )
        throw Error('scope');
      if (query.kind === 'projects' && !Number.isInteger(anchor.rank)) throw Error('rank');
      const index = rows.findIndex((row) =>
        query.kind === 'tasks'
          ? archivedAt(row) < anchor.at ||
            (archivedAt(row) === anchor.at && entity(row).id > anchor.id)
          : rank(row) > anchor.rank || (rank(row) === anchor.rank && entity(row).id > anchor.id),
      );
      start = index < 0 ? rows.length : index;
    } catch {
      throw new StudioApiError({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid archive cursor or query scope',
          fieldErrors: { cursor: ['Invalid archive cursor or query scope'] },
        },
      });
    }
  }
  const items = rows.slice(start, start + query.limit),
    last = items.at(-1);
  return {
    items,
    total: rows.length,
    nextCursor:
      last && start + items.length < rows.length
        ? btoa(
            JSON.stringify({
              signature,
              id: entity(last).id,
              at: archivedAt(last),
              rank: rank(last),
            }),
          )
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '')
        : null,
  };
}
