import { DateOnlySchema } from '@studio/contracts/api';
import type { DateOnly, TaskDto } from '@studio/contracts/api';
import { addDateDays, dateDistance } from './task-view.ts';

export type CalendarMode = 'month' | 'week';
export type WeekStart = 0 | 1 | 6;
export interface CalendarCell { date: DateOnly; day: number; outside: boolean; today: boolean }
export function startOfCalendarWeek(date: DateOnly, weekStart: WeekStart): DateOnly {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDateDays(date, -((weekday - weekStart + 7) % 7));
}
export function buildCalendarCells(date: DateOnly, mode: CalendarMode, weekStart: WeekStart, today: DateOnly): readonly CalendarCell[] {
  const first = DateOnlySchema.parse(`${date.slice(0, 7)}-01`);
  const start = startOfCalendarWeek(mode === 'month' ? first : date, weekStart);
  // Source always starts with 42 cells and trims to 35, including February.
  const length = mode === 'week' ? 7 : addDateDays(start, 35).slice(0, 7) !== date.slice(0, 7) ? 35 : 42;
  return Array.from({ length }, (_, index) => { const value = addDateDays(start, index); return { date: value, day: Number(value.slice(8)), outside: value.slice(0, 7) !== date.slice(0, 7), today: value === today }; });
}
export function navigateCalendar(date: DateOnly, mode: CalendarMode, direction: -1 | 0 | 1, today: DateOnly): DateOnly {
  if (direction === 0) return today;
  if (mode === 'week') return addDateDays(date, direction * 7);
  const next = new Date(`${date.slice(0, 7)}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + direction);
  return DateOnlySchema.parse(next.toISOString().slice(0, 10));
}
// Calendar and Timeline date drags share one DateOnly duration calculation.
// A missing start is omitted from PATCH; a start without due is kept and validated.
export function rescheduleDateOnly(task: Pick<TaskDto, 'startDate' | 'dueDate'>, dueDate: DateOnly): Pick<TaskDto, 'dueDate'> & Partial<Pick<TaskDto, 'startDate'>> {
  DateOnlySchema.parse(dueDate);
  return { dueDate, ...(task.startDate && task.dueDate ? { startDate: addDateDays(dueDate, -dateDistance(task.dueDate, task.startDate)) } : {}) };
}
