import type { EntityId, TaskQuery } from '@studio/contracts/api';
import { FileSchema } from '@studio/contracts/api';
import {
  compareTaskTuple,
  filterTasks,
  sortTasks,
  summarizeTasks,
  taskSortValue,
} from '@studio/domain';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { instant } from '../../../shared/clock.ts';
import { decodeCursor, encodeCursor, queryFingerprint } from '../../../shared/cursor.ts';
import { members } from '../../members/projections.ts';
import { today } from '../../workspaces/index.ts';
import { subtaskDto, taskDto } from '../mapper.ts';
import { datasetProjects, datasetRows } from '../persistence/dataset.ts';
import { attachmentRows, childRows, keyTaskId, taskRow } from '../persistence/reads.ts';

export async function taskDataset(r: RequestRepository, s: WorkspaceContext, now: number) {
  const rows = await datasetRows(r, s),
    ms = await members(r, s),
    ps = await datasetProjects(r, s);
  return {
    rows,
    items: rows.map(taskDto),
    env: { today: await today(r, s, now), now, lookups: { members: ms, projects: ps } },
  };
}
export async function taskDetail(r: RequestRepository, s: WorkspaceContext, id: EntityId) {
  const row = await taskRow(r, s, id),
    children = await childRows(r, s, id);
  const attachments = row.archivedAt !== null ? [] : await attachmentRows(r, s, id, row.projectId);
  return {
    task: taskDto(row),
    subtasks: children.map(subtaskDto),
    attachments: attachments.map((f) =>
      FileSchema.parse({
        id: f.id,
        workspaceId: f.workspaceId,
        projectId: f.projectId,
        taskId: f.taskId,
        name: f.name,
        fileType: f.fileType,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        displaySize: f.displaySize,
        storageMode: f.storageMode,
        contentAvailable: f.storageMode === 'r2',
        createdBy: f.createdBy,
        createdAt: instant(f.createdAt),
        version: f.version,
      }),
    ),
  };
}
export async function queryTasks(
  r: RequestRepository,
  s: WorkspaceContext,
  query: TaskQuery,
  now: number,
  summary = false,
) {
  const dataset = await taskDataset(r, s, now),
    rows = sortTasks(filterTasks(dataset.items, query, dataset.env), query, dataset.env.lookups);
  if (summary) return summarizeTasks(rows, dataset.env.today);
  const fingerprintInput = { scope: s, query: { ...query, cursor: undefined, limit: undefined } };
  const fingerprint = await queryFingerprint(fingerprintInput);
  let selected = rows;
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor, {
      queryFingerprint: fingerprint,
      sortField: query.sortField,
      sortDirection: query.sortDirection,
    });
    selected = rows.filter(
      (row) =>
        compareTaskTuple(
          { value: taskSortValue(row, query.sortField, dataset.env.lookups), id: row.id },
          { value: cursor.sortValue, id: cursor.id },
          query.sortDirection,
        ) > 0,
    );
  }
  const items = selected.slice(0, query.limit),
    last = items.at(-1);
  return {
    items,
    total: rows.length,
    nextCursor:
      selected.length > items.length && last
        ? encodeCursor({
            formatVersion: 1,
            queryFingerprint: fingerprint,
            sortField: query.sortField,
            sortDirection: query.sortDirection,
            sortValue: taskSortValue(last, query.sortField, dataset.env.lookups),
            id: last.id,
          })
        : null,
  };
}
export async function resolveTaskKey(r: RequestRepository, s: WorkspaceContext, key: string) {
  return taskDetail(r, s, await keyTaskId(r, s, key));
}
