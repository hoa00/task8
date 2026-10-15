import type { TaskEvaluation, TaskGroupBy } from './task-query.ts';
export type { TaskGroupBy } from './task-query.ts';
import { DateOnlySchema, priorities, taskStatuses } from '@studio/contracts/api';
import type {
  DateOnly,
  MemberDisplayDto,
  ProjectDto,
  TaskDto,
  TaskFilter,
  TaskQuery,
  TaskSummaryDto,
} from '@studio/contracts/api';

export interface TaskLookups {
  members: readonly MemberDisplayDto[];
  projects: readonly Pick<ProjectDto, 'id' | 'name' | 'color'>[];
}
export interface TaskViewEnvironment {
  today: DateOnly;
  now: number;
  lookups: TaskLookups;
}
const day = 86400000;
export function dateDistance(date: DateOnly, today: DateOnly): number {
  return (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / day;
}
export function addDateDays(date: DateOnly, days: number): DateOnly {
  return DateOnlySchema.parse(
    new Date(Date.parse(`${date}T00:00:00Z`) + days * day).toISOString().slice(0, 10),
  );
}
export function nextRecurrenceDate(
  date: DateOnly,
  recurrence: NonNullable<TaskDto['recurrence']>,
): DateOnly {
  if (recurrence !== 'monthly')
    return addDateDays(date, { daily: 1, weekly: 7, biweekly: 14 }[recurrence]);
  const [year, month, dateDay] = date.split('-').map(Number) as [number, number, number];
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(1);
  next.setUTCMonth(month);
  const last = new Date(next);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  next.setUTCDate(Math.min(dateDay, last.getUTCDate()));
  if (year < 1) throw new TypeError('Invalid year');
  return DateOnlySchema.parse(next.toISOString().slice(0, 10));
}
export function isTaskOverdue(task: TaskDto, today: DateOnly): boolean {
  return task.status !== 'done' && task.dueDate !== null && task.dueDate < today;
}
export function matchesTaskFilter(
  task: TaskDto,
  filter: TaskFilter,
  env: TaskViewEnvironment,
): boolean {
  if (!filter.values.length) return true;
  let hit: boolean;
  switch (filter.field) {
    case 'labels':
      hit = filter.values.some((value) => task.labelIds.includes(value));
      break;
    case 'assignee':
      hit = filter.values.includes(task.assigneeId);
      break;
    case 'status':
      hit = filter.values.includes(task.status);
      break;
    case 'priority':
      hit = filter.values.includes(task.priority);
      break;
    case 'project':
      hit = filter.values.includes(task.projectId);
      break;
    case 'due':
      hit = filter.values.some((value) => {
        if (value === 'nodate') return task.dueDate === null;
        if (!task.dueDate) return false;
        const distance = dateDistance(task.dueDate, env.today);
        return value === 'overdue'
          ? isTaskOverdue(task, env.today)
          : value === 'today'
            ? distance === 0
            : value === 'week'
              ? distance >= 0 && distance <= 7
              : distance > 7;
      });
      break;
    case 'created':
    case 'updated':
      hit = filter.values.some(
        (value) =>
          env.now - Date.parse(filter.field === 'created' ? task.createdAt : task.updatedAt) <=
          Number(value) * day,
      );
      break;
  }
  return filter.op === 'not' ? !hit : hit;
}
export function taskSortValue(
  task: TaskDto,
  sortField: TaskQuery['sortField'],
  lookups: TaskLookups,
): string | number | null {
  switch (sortField) {
    case 'manual':
      return task.position;
    case 'title':
      return task.title.toLowerCase();
    case 'due':
      return task.dueDate ?? '9999';
    case 'start':
      return task.startDate ?? '9999';
    case 'priority':
      return -priorities.find((value) => value.id === task.priority)!.weight;
    case 'status':
      return taskStatuses.findIndex((value) => value.id === task.status);
    case 'assignee':
      return lookups.members.find((member) => member.id === task.assigneeId)?.name ?? 'zzz';
    case 'created':
      return -Date.parse(task.createdAt);
    case 'updated':
      return -Date.parse(task.updatedAt);
    case 'estimate':
      return task.estimate ?? 'zzz';
    case 'project':
      return lookups.projects.find((project) => project.id === task.projectId)?.name ?? null;
  }
}
export function compareTaskTuple(
  a: { value: string | number | null; id: string },
  b: { value: string | number | null; id: string },
  direction: TaskQuery['sortDirection'],
): number {
  const order =
    a.value !== null && b.value !== null ? (a.value > b.value ? 1 : a.value < b.value ? -1 : 0) : 0;
  return order * (direction === 'desc' ? -1 : 1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function sortTasks(
  tasks: readonly TaskDto[],
  query: Pick<TaskQuery, 'sortField' | 'sortDirection'>,
  lookups: TaskLookups,
): TaskDto[] {
  return [...tasks].sort((a, b) =>
    compareTaskTuple(
      { value: taskSortValue(a, query.sortField, lookups), id: a.id },
      { value: taskSortValue(b, query.sortField, lookups), id: b.id },
      query.sortDirection,
    ),
  );
}
export function filterTasks(
  tasks: readonly TaskDto[],
  query: TaskQuery,
  env: TaskViewEnvironment,
): TaskDto[] {
  const q = query.q.toLowerCase();
  return tasks.filter(
    (task) =>
      (!query.projectId || task.projectId === query.projectId) &&
      (query.assigneeId === undefined || task.assigneeId === query.assigneeId) &&
      (!query.favoriteOnly || task.isFavorite) &&
      !!task.archivedAt === query.archived &&
      query.filters.every((filter) => matchesTaskFilter(task, filter, env)) &&
      (!q || task.title.toLowerCase().includes(q) || task.key.toLowerCase().includes(q)) &&
      ((!query.rangeFrom && !query.rangeTo) ||
        (query.rangeBasis === 'due'
          ? !!task.dueDate &&
            (!query.rangeFrom || task.dueDate >= query.rangeFrom) &&
            (!query.rangeTo || task.dueDate <= query.rangeTo)
          : !!(task.startDate || task.dueDate) &&
            (!query.rangeFrom || (task.dueDate ?? task.startDate!) >= query.rangeFrom) &&
            (!query.rangeTo || (task.startDate ?? task.dueDate!) <= query.rangeTo))),
  );
}
export interface TaskGroup {
  key: string;
  name: string;
  taskIds: readonly TaskDto['id'][];
  patch?: Partial<Pick<TaskDto, 'status' | 'priority' | 'assigneeId' | 'projectId'>>;
}
export const dueBuckets = [
  { id: 'overdue', name: 'Overdue' },
  { id: 'today', name: 'Today' },
  { id: 'week', name: 'Next 7 days' },
  { id: 'later', name: 'Later' },
  { id: 'nodate', name: 'No due date' },
] as const;
export function groupTasks(
  tasks: readonly TaskDto[],
  groupBy: TaskGroupBy,
  env: TaskViewEnvironment,
): TaskGroup[] {
  if (groupBy === 'none')
    return [{ key: 'all', name: 'All tasks', taskIds: tasks.map((task) => task.id) }];
  const groups: Omit<TaskGroup, 'taskIds'>[] =
    groupBy === 'status'
      ? taskStatuses.map((value) => ({
          key: value.id,
          name: value.name,
          patch: { status: value.id },
        }))
      : groupBy === 'priority'
        ? priorities.map((value) => ({
            key: value.id,
            name: value.name,
            patch: { priority: value.id },
          }))
        : groupBy === 'assignee'
          ? [
              ...env.lookups.members.map((value) => ({
                key: value.id,
                name: value.name,
                patch: { assigneeId: value.id },
              })),
              { key: 'none', name: 'Unassigned', patch: { assigneeId: null } },
            ]
          : groupBy === 'project'
            ? env.lookups.projects.map((value) => ({
                key: value.id,
                name: value.name,
                patch: { projectId: value.id },
              }))
            : dueBuckets.map((value) => ({ key: value.id, name: value.name }));
  return groups
    .map((group) => ({
      ...group,
      taskIds: tasks
        .filter((task) =>
          groupBy === 'due'
            ? matchesTaskFilter(
                task,
                {
                  field: 'due',
                  op: 'is',
                  values: [group.key as (typeof dueBuckets)[number]['id']],
                },
                env,
              )
            : groupBy === 'assignee'
              ? (task.assigneeId ?? 'none') === group.key
              : groupBy === 'project'
                ? task.projectId === group.key
                : task[groupBy] === group.key,
        )
        .map((task) => task.id),
    }))
    .filter((group) => groupBy === 'status' || groupBy === 'priority' || group.taskIds.length > 0);
}
export function summarizeTasks(tasks: readonly TaskDto[], today: DateOnly): TaskSummaryDto {
  const unique = [...new Map(tasks.map((task) => [task.id, task])).values()];
  const byStatus = { backlog: 0, todo: 0, progress: 0, review: 0, done: 0 },
    byPriority = { urgent: 0, high: 0, medium: 0, low: 0, none: 0 };
  unique.forEach((task) => {
    byStatus[task.status]++;
    byPriority[task.priority]++;
  });
  return {
    total: unique.length,
    byStatus,
    byPriority,
    overdue: unique.filter((task) => isTaskOverdue(task, today)).length,
    completed: byStatus.done,
    completionRate: unique.length ? Math.round((byStatus.done / unique.length) * 100) : 0,
    subtaskTotals: {
      total: unique.reduce((sum, task) => sum + task.subtaskSummary.total, 0),
      completed: unique.reduce((sum, task) => sum + task.subtaskSummary.completed, 0),
    },
  };
}
export interface TaskRowModel {
  task: TaskDto;
  assignee: MemberDisplayDto | null;
  project: TaskLookups['projects'][number] | null;
  overdue: boolean;
}
export function evaluateTaskView(
  tasks: readonly TaskDto[],
  view: TaskEvaluation,
  env: TaskViewEnvironment,
) {
  const filtered = sortTasks(filterTasks(tasks, view.query, env), view.query, env.lookups);
  return {
    taskIds: filtered.map((task) => task.id),
    totalBeforeFilters: tasks.length,
    groups: groupTasks(filtered, view.groupBy, env),
    summary: summarizeTasks(filtered, env.today),
    rows: new Map(
      filtered.map((task) => [
        task.id,
        {
          task,
          assignee: env.lookups.members.find((member) => member.id === task.assigneeId) ?? null,
          project: env.lookups.projects.find((project) => project.id === task.projectId) ?? null,
          overdue: isTaskOverdue(task, env.today),
        } satisfies TaskRowModel,
      ]),
    ),
  };
}
