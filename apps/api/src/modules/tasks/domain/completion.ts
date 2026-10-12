import type { TaskStatus } from '@studio/contracts/api';
import type { CompletionState } from './model.ts';

export type CompletionDecision =
  | { readonly kind: 'noop'; readonly status: TaskStatus }
  | { readonly kind: 'change'; readonly status: TaskStatus };

export function decideCompletion(state: CompletionState, completed: boolean): CompletionDecision {
  if (completed === (state.status === 'done')) return { kind: 'noop', status: state.status };
  return {
    kind: 'change',
    status: completed
      ? 'done'
      : state.previousStatus && state.previousStatus !== 'done'
        ? state.previousStatus
        : 'todo',
  };
}

export function transitionCompletion(
  state: CompletionState,
  status: TaskStatus,
  now: number,
): CompletionState {
  return {
    status,
    completedAt: status === 'done' ? (state.status === 'done' ? state.completedAt : now) : null,
    previousStatus:
      status === 'done' && state.status !== 'done' ? state.status : state.previousStatus,
  };
}
