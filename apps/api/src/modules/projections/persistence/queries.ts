import type { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { readAccessSql as accessSql } from '../../projects/access.ts';

export function calendarRead(
  r: RequestRepository,
  table: 'calendarEvents' | 'projectMilestones',
  query:
    | {
        from: string & z.core.$brand<'DateOnly'>;
        to: string & z.core.$brand<'DateOnly'>;
        projectId?: (string & z.core.$brand<'EntityId'>) | undefined;
      }
    | {
        from?: (string & z.core.$brand<'DateOnly'>) | undefined;
        to?: (string & z.core.$brand<'DateOnly'>) | undefined;
        projectId?: (string & z.core.$brand<'EntityId'>) | undefined;
      },
  milestones: boolean,
  s: WorkspaceContext,
) {
  return r.all(
    `SELECT e.* FROM ${table} e JOIN projects p ON p.workspaceId=e.workspaceId AND p.id=e.projectId WHERE e.workspaceId=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql} ${query.projectId ? 'AND e.projectId=?' : ''} ${query.from ? 'AND e.date>=?' : ''} ${query.to ? 'AND e.date<=?' : ''} ORDER BY e.date,${milestones ? 'e.position' : 'e.localTime'},e.id`,
    [
      s.workspaceId,
      s.memberId,
      ...(query.projectId ? [query.projectId] : []),
      ...(query.from ? [query.from] : []),
      ...(query.to ? [query.to] : []),
    ],
  );
}
