import { translate as t } from '../../i18n/i18n.ts';
import type { ActivityDto } from '@studio/contracts/api';
export const activityVerbs: Record<ActivityDto['eventType'], string> = { 'task.created': 'created', 'task.updated': 'updated', 'task.moved': 'moved', 'task.completed': 'completed', 'task.archived': 'archived', 'task.deleted': 'deleted', 'task.assigned': 'assigned', 'task.priorityChanged': 'changed priority of', 'comment.created': 'commented on', 'file.created': 'added a file to', 'file.updated': 'updated a file on', 'file.deleted': 'removed a file from', 'project.created': 'created project', 'project.updated': 'updated project', 'project.archived': 'archived project', 'project.deleted': 'deleted project', 'team.created': 'created team', 'team.updated': 'updated team', 'team.deleted': 'deleted team' };
export function activityDay(instant: string, today: string) { const distance = Math.round((Date.parse(`${instant.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000); return distance === 0 ? 'Today' : distance === -1 ? 'Yesterday' : distance > -7 ? 'This week' : 'Earlier'; }

export function matchesActivity(row: ActivityDto, filter: 'all' | 'status' | 'comments' | 'projects') { return filter === 'all' || filter === 'comments' && row.eventType === 'comment.created' || filter === 'status' && (row.eventType === 'task.moved' || row.eventType === 'task.completed' || row.eventType === 'task.updated' && row.payload.status !== undefined && row.payload.previousStatus !== undefined && row.payload.status !== row.payload.previousStatus) || filter === 'projects' && row.eventType.startsWith('project.'); }

/** System wording is localized; names and arbitrary payload content stay literal. */
export function activityDetail(row: Pick<ActivityDto, 'eventType' | 'payload'>): string {
  const detail = row.payload.detail ?? '';
  if (!detail.startsWith('to ')) return detail;
  const name = detail.slice(3);
  if (row.eventType === 'task.assigned') return t('to {{member}}', { member: name });
  return row.eventType === 'task.moved' || row.eventType === 'task.priorityChanged' ? t('to {{name}}', { name: t(name) }) : detail;
}
