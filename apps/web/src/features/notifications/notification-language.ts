import { priorities, taskStatuses } from '@studio/contracts/api';
import type { BootstrapDto, NotificationDto } from '@studio/contracts/api';
import { translate as t } from '../../i18n/i18n.ts';

/** Translate generated notification wording without altering names or comment snippets. */
export function notificationText(notification: NotificationDto, data: BootstrapDto): string {
  const project = data.projects.find(row => row.project.id === notification.projectId)?.project;
  if (project && notification.text === `${project.name} is at risk`) return t('{{name}} is at risk', { name: project.name });
  const moved = notification.text.match(/^moved to (.+)$/);
  const status = moved && taskStatuses.find(row => row.name === moved[1]);
  return status ? t('moved to {{status}}', { status: t(status.name) }) : t(notification.text);
}
export function notificationSnippet(notification: NotificationDto): string {
  const snippet = notification.snippet;
  if (notification.type === 'assign') {
    const dueDays = snippet.match(/^Due in (\d+) days?$/);
    if (dueDays) return t('Due in {{count}} days', { count: Number(dueDays[1]) });
    const duePriority = snippet.match(/^Due today · (.+) priority$/);
    const priority = duePriority && priorities.find(row => row.name === duePriority[1]);
    if (priority) return t('Due today · {{priority}} priority', { priority: t(priority.name) });
  }
  if (notification.type === 'update' && notification.text.startsWith('moved to ')) {
    const names = snippet.split(' → ');
    if (names.length === 2 && names.every(name => taskStatuses.some(row => row.name === name))) return names.map(name => t(name)).join(' → ');
  }
  if (!notification.actorId && notification.projectId && !notification.taskId) {
    const dueTasks = snippet.match(/^(\d+) tasks due this week are not started$/);
    if (dueTasks) return t('{{count}} tasks due this week are not started', { count: Number(dueTasks[1]) });
  }
  return snippet;
}
