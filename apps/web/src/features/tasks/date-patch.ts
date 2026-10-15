import type { DateOnly } from '@studio/contracts/api';
import type { TaskFieldPatch, TaskFieldValues } from './field-types.ts';
export type TaskDateValues = Pick<TaskFieldValues, 'startDate' | 'dueDate'>;
// Record edits keep a valid interval by moving the opposite endpoint only on
// crossing. Drafts preserve the user's independent inputs for submit validation.
// Calendar/timeline drag rescheduling deliberately preserves duration elsewhere.
export function taskDatePatch(
  current: TaskDateValues,
  field: keyof TaskDateValues,
  next: DateOnly | null,
  kind: 'record' | 'draft',
): TaskFieldPatch {
  const patch: TaskFieldPatch = { [field]: next };
  if (kind === 'record' && next !== null) {
    if (field === 'dueDate' && current.startDate && current.startDate > next)
      patch.startDate = next;
    if (field === 'startDate' && current.dueDate && current.dueDate < next) patch.dueDate = next;
  }
  return patch;
}
export function taskFieldPatch<K extends keyof TaskFieldValues>(
  current: TaskFieldValues,
  field: K,
  next: TaskFieldValues[K],
  kind: 'record' | 'draft',
): TaskFieldPatch {
  return field === 'startDate' || field === 'dueDate'
    ? taskDatePatch(current, field, next as DateOnly | null, kind)
    : { [field]: next };
}
