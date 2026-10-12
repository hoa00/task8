import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { matchedBatch } from '../../../db/commands.ts';
import { actorSql, writeAccessSql } from '../access.ts';
import type { ViewRow } from './saved-views-model.ts';
export function guardPredicateProjects() {
  return `EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=? AND p.id=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${writeAccessSql}) AND ${actorSql()}`;
}
export function listSavedViewsReadSavedViews(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.all<ViewRow>(
    'SELECT * FROM savedViews WHERE workspaceId=? AND projectId=? ORDER BY position,id',
    [s.workspaceId, id],
  );
}
export function createSavedViewCommitSavedViews(
  r: RequestRepository,
  g: { sql: string; parameters: string[] },
  viewId: EntityId,
  s: WorkspaceContext,
  id: EntityId,
  body: {
    name: string;
    type: 'list' | 'board' | 'table';
    filters: (
      | {
          field: 'status';
          op: 'is' | 'not';
          values: ('done' | 'todo' | 'backlog' | 'progress' | 'review')[];
        }
      | { field: 'assignee'; op: 'is' | 'not'; values: (EntityId | null)[] }
      | {
          field: 'priority';
          op: 'is' | 'not';
          values: ('urgent' | 'high' | 'medium' | 'low' | 'none')[];
        }
      | {
          field: 'due';
          op: 'is' | 'not';
          values: ('overdue' | 'today' | 'week' | 'later' | 'nodate')[];
        }
      | { field: 'project'; op: 'is' | 'not'; values: EntityId[] }
      | {
          field: 'labels';
          op: 'is' | 'not';
          values: (
            | 'design'
            | 'frontend'
            | 'backend'
            | 'research'
            | 'content'
            | 'bug'
            | 'qa'
            | 'growth'
          )[];
        }
      | { field: 'created'; op: 'is' | 'not'; values: ('1' | '7' | '30')[] }
      | { field: 'updated'; op: 'is' | 'not'; values: ('1' | '7' | '30')[] }
    )[];
  },
  now: number,
) {
  return matchedBatch<ViewRow>(r, [
    r.prepare(
      `INSERT INTO savedViews(id,workspaceId,projectId,name,type,filtersJson,createdBy,position,createdAt,updatedAt,version,lastMutationId) SELECT ?,?,?,?,?,?,?,(SELECT coalesce(max(position),-100)+100 FROM savedViews WHERE workspaceId=? AND projectId=?),?,?,1,? WHERE ${g.sql}`,
      [
        viewId,
        s.workspaceId,
        id,
        body.name,
        body.type,
        JSON.stringify(body.filters),
        s.memberId,
        s.workspaceId,
        id,
        now,
        now,
        viewId,
        ...g.parameters,
      ],
    ),
    r.prepare('SELECT * FROM savedViews WHERE workspaceId=? AND id=?', [s.workspaceId, viewId]),
  ]);
}
export function changeSavedViewReadSavedViews(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.all<ViewRow>('SELECT * FROM savedViews WHERE workspaceId=? AND id=?', [
    s.workspaceId,
    id,
  ]);
}
export function changeSavedViewPredicateSavedViews() {
  return 'DELETE FROM savedViews';
}
export function changeSavedViewPredicateSavedViewsResult(fields: Record<string, string | number>) {
  return `UPDATE savedViews SET ${Object.keys(fields)
    .map((key) => key + '=?')
    .join(',')},version=version+1`;
}
export function changeSavedViewPrepare(
  r: RequestRepository,
  sql: string,
  g: { sql: string; parameters: string[] },
  remove: boolean,
  fields: Record<string, string | number>,
  s: WorkspaceContext,
  id: EntityId,
  body:
    | {
        expectedVersion: number;
        name?: string | undefined;
        type?: 'list' | 'board' | 'table' | undefined;
        filters?:
          | (
              | {
                  field: 'status';
                  op: 'is' | 'not';
                  values: ('done' | 'todo' | 'backlog' | 'progress' | 'review')[];
                }
              | { field: 'assignee'; op: 'is' | 'not'; values: (EntityId | null)[] }
              | {
                  field: 'priority';
                  op: 'is' | 'not';
                  values: ('urgent' | 'high' | 'medium' | 'low' | 'none')[];
                }
              | {
                  field: 'due';
                  op: 'is' | 'not';
                  values: ('overdue' | 'today' | 'week' | 'later' | 'nodate')[];
                }
              | { field: 'project'; op: 'is' | 'not'; values: EntityId[] }
              | {
                  field: 'labels';
                  op: 'is' | 'not';
                  values: (
                    | 'design'
                    | 'frontend'
                    | 'backend'
                    | 'research'
                    | 'content'
                    | 'bug'
                    | 'qa'
                    | 'growth'
                  )[];
                }
              | { field: 'created'; op: 'is' | 'not'; values: ('1' | '7' | '30')[] }
              | { field: 'updated'; op: 'is' | 'not'; values: ('1' | '7' | '30')[] }
            )[]
          | undefined;
      }
    | { expectedVersion: number },
) {
  return r.prepare(`${sql} WHERE workspaceId=? AND id=? AND version=? AND ${g.sql}`, [
    ...(remove ? [] : Object.values(fields)),
    s.workspaceId,
    id,
    body.expectedVersion,
    ...g.parameters,
  ]);
}
export function changeSavedViewPrepareSavedViews(
  r: RequestRepository,
  s: WorkspaceContext,
  id: EntityId,
) {
  return r.prepare('SELECT * FROM savedViews WHERE workspaceId=? AND id=?', [s.workspaceId, id]);
}
export function changeSavedViewCommit(r: RequestRepository, statements: D1PreparedStatement[]) {
  return matchedBatch<ViewRow>(r, statements);
}
