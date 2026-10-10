import type { DateOnly, MilestoneDto, TaskDto } from '@studio/contracts/api';
import { startOfCalendarWeek } from './calendar.ts';
import type { WeekStart } from './calendar.ts';
import { addDateDays, dateDistance, groupTasks } from './task-view.ts';
import type { TaskGroup, TaskLookups } from './task-view.ts';

export type TimelineZoom = 'week' | 'month';
export type TimelineGrouping = 'status' | 'assignee' | 'project' | 'none';
export type TimelineRow = { kind: 'milestones' } | { kind: 'group'; group: TaskGroup } | { kind: 'task'; task: TaskDto };
export interface TimelineGeometryInput {
  tasks: readonly TaskDto[]; milestones: readonly MilestoneDto[]; lookups: TaskLookups;
  zoom: TimelineZoom; grouping: TimelineGrouping; today: DateOnly; weekStart: WeekStart;
  projectId?: TaskDto['projectId'];
}
export function timelineRange(today: DateOnly, zoom: TimelineZoom, weekStart: WeekStart) {
  const start = startOfCalendarWeek(addDateDays(today, zoom === 'week' ? -21 : -56), weekStart), days = zoom === 'week' ? 91 : 238;
  return { start, end: addDateDays(start, days - 1), days, dayWidth: zoom === 'week' ? 32 : 11 };
}
export function timelineDayOffset(pointerDelta: number, scrollDelta: number, dayWidth: number): number {
  if (!Number.isFinite(pointerDelta + scrollDelta) || ![32, 11].includes(dayWidth)) throw new TypeError('Invalid timeline drag');
  return Math.round((pointerDelta + scrollDelta) / dayWidth);
}
export function timelineTaskProgress(task: TaskDto): number {
  return task.status === 'done' ? 100 : task.subtaskSummary.total ? Math.round(task.subtaskSummary.completed / task.subtaskSummary.total * 100) : { backlog: 0, todo: 5, progress: 45, review: 80 }[task.status];
}
export function buildTimelineGeometry(input: TimelineGeometryInput) {
  const { tasks, milestones, today, zoom, grouping, lookups } = input, range = timelineRange(today, zoom, input.weekStart);
  const x = (date: DateOnly) => dateDistance(date, range.start) * range.dayWidth;
  const effectiveGrouping = grouping === 'project' && input.projectId ? 'status' : grouping;
  const dated = tasks.filter(task => task.dueDate), byId = new Map(dated.map(task => [task.id, task]));
  const ordinal = new Map(tasks.map((task, index) => [task.id, index]));
  const rows: TimelineRow[] = milestones.length ? [{ kind: 'milestones' }] : [];
  for (const group of groupTasks(dated, effectiveGrouping, { today, now: 0, lookups }).filter(group => group.taskIds.length)) {
    if (grouping !== 'none') rows.push({ kind: 'group', group });
    const ordered = group.taskIds.map(id => byId.get(id)!).sort((a, b) => {
      const as = a.startDate ?? a.dueDate!, bs = b.startDate ?? b.dueDate!;
      // Timeline's internal presentation order is separate from the API query
      // tuple/cursor comparator. Source returns -1 for equal dates, reversing
      // incoming ordinal. Encode that behavior as a valid total order.
      return as < bs ? -1 : as > bs ? 1 : ordinal.get(b.id)! - ordinal.get(a.id)! || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    rows.push(...ordered.map(task => ({ kind: 'task' as const, task })));
  }
  const bars = rows.flatMap((row, index) => {
    if (row.kind !== 'task') return [];
    const task = row.task, start = task.startDate && task.startDate <= task.dueDate! ? task.startDate : task.dueDate!;
    const width = Math.max(range.dayWidth, (dateDistance(task.dueDate!, start) + 1) * range.dayWidth);
    return [{ task, start, x: x(start), y: index * 36 + 7, width, inside: width > 110, progress: timelineTaskProgress(task) }];
  });
  const centers = new Map(rows.flatMap((row, index) => row.kind === 'task' ? [[row.task.id, index * 36 + 18] as const] : []));
  // Source groups a fresh due-filtered array, so dependency paint order always
  // follows the incoming query records, even when grouping is 'none'.
  const edges = tasks.flatMap(task => task.dependencyIds.flatMap(id => {
    const dependency = byId.get(id), y1 = centers.get(id), y2 = centers.get(task.id);
    if (!dependency?.dueDate || !task.dueDate || y1 === undefined || y2 === undefined) return [];
    const x1 = x(dependency.dueDate) + range.dayWidth, x2 = x(task.startDate && task.startDate <= task.dueDate ? task.startDate : task.dueDate);
    return [{ from: id, to: task.id, backward: x2 < x1, path: `M${x1} ${y1} C ${Math.max(x1 + 10, x2 - 10)} ${y1}, ${Math.min(x1 + 10, x2 - 10)} ${y2}, ${x2 - 1} ${y2}`, arrow: `M${x2 - 6} ${y2 - 3.5} L${x2 - 1} ${y2} L${x2 - 6} ${y2 + 3.5}` }];
  }));
  const byDate = new Map<DateOnly, MilestoneDto[]>();
  for (const milestone of milestones) byDate.set(milestone.date, [...(byDate.get(milestone.date) ?? []), milestone]);
  const points = [...byDate].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([date, items]) => ({ date, items, x: x(date) + range.dayWidth / 2 }));
  const milestonePoints = points.map((point, index) => { const room = (points[index + 1]?.x ?? Infinity) - point.x - 24; return { ...point, label: point.items[0]!.name + (point.items.length > 1 ? ` +${point.items.length - 1}` : ''), showLabel: room >= 28, maxWidth: Number.isFinite(room) ? Math.round(room) : undefined }; });
  const months: { date: DateOnly; days: number }[] = [];
  for (let index = 0; index < range.days; index++) { const date = addDateDays(range.start, index); if (months.at(-1)?.date.slice(0, 7) !== date.slice(0, 7)) months.push({ date, days: 0 }); months.at(-1)!.days++; }
  const days = Array.from({ length: range.days / (zoom === 'week' ? 1 : 7) }, (_, index) => { const date = addDateDays(range.start, index * (zoom === 'week' ? 1 : 7)); return { date, today: date === today }; });
  const weekends = zoom === 'week' ? Array.from({ length: range.days }, (_, index) => index).filter(index => [0, 6].includes(new Date(`${addDateDays(range.start, index)}T00:00:00Z`).getUTCDay())).map(index => index * range.dayWidth) : [];
  return { today, range, rows, bars, edges, milestonePoints, months, days, weekends, effectiveGrouping, width: range.days * range.dayWidth, height: rows.length * 36, todayX: x(today), gridLines: Array.from({ length: range.days / 7 }, (_, index) => index * 7 * range.dayWidth) };
}
export type TimelineGeometry = ReturnType<typeof buildTimelineGeometry>;
