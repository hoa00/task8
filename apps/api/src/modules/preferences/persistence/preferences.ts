import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { actorParameters, actorSql } from '../../projects/access.ts';

export function preferencesCommitMemberPreferences(
  r: RequestRepository,
  column: 'preferencesJson' | 'notificationPreferencesJson',
  patch:
    | {
        theme?: 'system' | 'light' | 'dark' | undefined;
        accent?: 'blue' | 'violet' | 'teal' | 'rose' | 'indigo' | 'graphite' | undefined;
        side?: 'comfortable' | 'compact' | undefined;
        density?: 'comfortable' | 'compact' | undefined;
        weekStart?: 0 | 1 | 6 | undefined;
        dateFmt?: 'MMM d' | 'd/M' | 'M/d' | 'yyyy-MM-dd' | undefined;
        tz?: string | undefined;
        timeFmt?: '12' | '24' | undefined;
        spell?: boolean | undefined;
        motion?: 'reduce' | 'system' | 'full' | undefined;
        home?: 'home' | 'mytasks' | 'inbox' | undefined;
        openTasks?: 'full' | 'drawer' | undefined;
        confirmDel?: boolean | undefined;
        defaultTab?: 'list' | 'board' | 'table' | 'overview' | 'timeline' | undefined;
        showDoneBoard?: boolean | undefined;
        lang?: 'vi' | 'en' | undefined;
      }
    | {
        emailMention?: boolean | undefined;
        emailAssign?: boolean | undefined;
        emailDigest?: boolean | undefined;
        emailComment?: boolean | undefined;
        pushMention?: boolean | undefined;
        pushAssign?: boolean | undefined;
        pushComment?: boolean | undefined;
        pushDue?: boolean | undefined;
        mentionAll?: boolean | undefined;
        assignSelf?: boolean | undefined;
        mentionTeam?: boolean | undefined;
        mentionWorkspace?: boolean | undefined;
        assignStatus?: boolean | undefined;
        assignOverdue?: boolean | undefined;
      },
  now: number,
  s: WorkspaceContext,
) {
  return r.batch<{ value: string }>([
    r.prepare(
      `UPDATE memberPreferences SET ${column}=json_patch(${column},?),updatedAt=? WHERE workspaceId=? AND memberId=? AND ${actorSql()}`,
      [JSON.stringify(patch), now, s.workspaceId, s.memberId, ...actorParameters(s)],
    ),
    r.prepare(`SELECT ${column} value FROM memberPreferences WHERE workspaceId=? AND memberId=?`, [
      s.workspaceId,
      s.memberId,
    ]),
  ]);
}
export function preferencesReadMemberPreferences(
  r: RequestRepository,
  column: 'preferencesJson' | 'notificationPreferencesJson',
  s: WorkspaceContext,
) {
  return r.all(`SELECT ${column} value FROM memberPreferences WHERE workspaceId=? AND memberId=?`, [
    s.workspaceId,
    s.memberId,
  ]);
}
