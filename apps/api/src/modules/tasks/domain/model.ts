import type { TaskStatus } from '@studio/contracts/api';
export interface CompletionState {
  readonly status: TaskStatus;
  readonly previousStatus: TaskStatus | null;
  readonly completedAt: number | null;
}
