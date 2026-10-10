import type { DateOnly, TaskDto } from '@studio/contracts/api';
import { priorities } from '@studio/contracts/api';
import { addDateDays, isTaskOverdue } from './task-view.ts';

export type HomeTaskTab = 'upcoming' | 'overdue' | 'completed';
// These arrays are complete authorized projections. Source's stable ties retain
// the aggregate's entity order, rather than reordering a seven-row preview.
export function homeTaskTabs(tasks: readonly TaskDto[], today: DateOnly) {
  return {
    upcoming: tasks.filter(task => task.status !== 'done' && !isTaskOverdue(task, today)).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    overdue: tasks.filter(task => isTaskOverdue(task, today)),
    completed: tasks.filter(task => task.status === 'done').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}
export function homeDeadlines(tasks: readonly TaskDto[], today: DateOnly) {
  const tomorrow = addDateDays(today, 1), last = addDateDays(today, 7);
  return [{ name: 'Today', from: today, to: today }, { name: 'Tomorrow', from: tomorrow, to: tomorrow }, { name: 'This week', from: addDateDays(today, 2), to: last }].map(group => ({
    ...group, tasks: tasks.filter(task => task.status !== 'done' && task.dueDate && task.dueDate >= group.from && task.dueDate <= group.to).sort((a, b) => priorities.find(row => row.id === b.priority)!.weight - priorities.find(row => row.id === a.priority)!.weight),
  }));
}
// Source uses a strict rolling elapsed-time bound, including future completedAt
// instants if supplied. No calendar-week or updatedAt substitution.
export function completedInRollingWeek(tasks: readonly TaskDto[], now: string): number {
  return tasks.filter(task => task.status === 'done' && task.completedAt && Date.parse(now) - Date.parse(task.completedAt) < 7 * 86400000).length;
}
