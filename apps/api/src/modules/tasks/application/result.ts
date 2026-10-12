import type { TaskDto } from '@studio/contracts/api';
import { ApiFailure } from '../../../shared/errors.ts';
export function requireResultTask(task: TaskDto | undefined): TaskDto {
  if (!task) throw new ApiFailure('INTERNAL_ERROR', 'Missing task command DTO');
  return task;
}
