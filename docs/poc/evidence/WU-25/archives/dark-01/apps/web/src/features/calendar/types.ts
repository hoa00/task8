import type { BootstrapDto, CalendarEventDto, DateOnly, TaskDto } from '@studio/contracts/api';
import type { CalendarMode, WeekStart } from '@studio/domain';
import type { TaskFormDefaults } from '../tasks/field-types';
export type CalendarScope = { kind: 'workspace' } | { kind: 'mine' } | { kind: 'project'; projectId: TaskDto['projectId'] };
export interface CalendarModel {
  data: BootstrapDto; tasks: readonly TaskDto[]; legendTasks: readonly TaskDto[]; events: readonly CalendarEventDto[]; scope: CalendarScope;
  date: DateOnly; today: DateOnly; mode: CalendarMode; weekStart: WeekStart; pending: boolean;
  onDateChange: (date: DateOnly) => void; onModeChange: (mode: CalendarMode) => void;
  onTaskOpen: (id: string) => void; onTaskMenu?: (id: string, anchor: HTMLElement, point: { x: number; y: number }) => void;
  onTaskDrop: (task: TaskDto, date: DateOnly) => Promise<boolean>;
  onNewTask: (defaults: TaskFormDefaults) => void;
  onProjectOpen: (id: string, tab: 'overview' | 'calendar') => void;
}
export type CalendarItem = { kind: 'event'; event: CalendarEventDto } | { kind: 'task'; task: TaskDto };
