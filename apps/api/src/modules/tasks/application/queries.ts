import {
  taskReadPlan,
  taskQueryCount,
  taskQueryPage,
  taskQuerySummary,
} from '../persistence/paged-reads.ts';
import type { EntityId, TaskQuery } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { decodeCursor, encodeCursor, queryFingerprint } from '../../../shared/cursor.ts';
import { fileDto } from '../../files/projections.ts';
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
    attachments: attachments.map((f) => fileDto(f)),
  };
}
export async function queryTasks(
  r: RequestRepository,
  s: WorkspaceContext,
  query: TaskQuery,
  now: number,
  summary = false,
) {
  const date = await today(r, s, now);
  const plan = taskReadPlan(s, query, { today: date, now });
  if (summary) return taskQuerySummary(r, plan);
  const fingerprint = await queryFingerprint({
    scope: s,
    query: { ...query, cursor: undefined, limit: undefined },
  });
  const cursor = query.cursor
    ? decodeCursor(query.cursor, {
        queryFingerprint: fingerprint,
        sortField: query.sortField,
        sortDirection: query.sortDirection,
      })
    : null;
  const total = await taskQueryCount(r, plan);
  const selected = await taskQueryPage(r, s, query, plan, cursor);
  const pageRows = selected.slice(0, query.limit),
    last = pageRows.at(-1);
  return {
    items: pageRows.map(taskDto),
    total,
    nextCursor:
      selected.length > pageRows.length && last
        ? encodeCursor({
            formatVersion: 1,
            queryFingerprint: fingerprint,
            sortField: query.sortField,
            sortDirection: query.sortDirection,
            sortValue: last.readSortValue,
            id: last.id,
          })
        : null,
  };
}
export async function resolveTaskKey(r: RequestRepository, s: WorkspaceContext, key: string) {
  return taskDetail(r, s, await keyTaskId(r, s, key));
}
