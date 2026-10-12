import { DateOnlySchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
export async function today(r: RequestRepository, s: WorkspaceContext, now: number) {
  const [row] = await r.all<{ timezone: string }>('SELECT timezone FROM workspaces WHERE id=?', [
    s.workspaceId,
  ]);
  return DateOnlySchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: requireTimezone(row).timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(now)),
  );
}
function requireTimezone(row: { timezone: string } | undefined) {
  if (!row) throw new ApiFailure('INTERNAL_ERROR', 'Workspace timezone is missing');
  return row;
}
