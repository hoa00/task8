import { decodeUndoPayload } from '../../../db/undo.ts';
import { ApiFailure } from '../../../shared/errors.ts';
type Payload = ReturnType<typeof decodeUndoPayload>;
type TaskUndoKind =
  | 'task.complete'
  | 'task.archive'
  | 'task.delete'
  | 'tasks.bulkDelete'
  | 'tasks.completeColumn'
  | 'tasks.archiveCompletedColumn';
type NarrowTask<P> = P extends { kind: infer Kind }
  ? Extract<Kind, TaskUndoKind> extends never
    ? never
    : Omit<P, 'kind'> & { kind: Extract<Kind, TaskUndoKind> }
  : never;
export type TaskUndoPayload = NarrowTask<Payload>;
export function decodeTaskUndoPayload(json: string): TaskUndoPayload {
  const payload = decodeUndoPayload(json);
  switch (payload.kind) {
    case 'task.archive':
    case 'task.delete':
      return { ...payload, kind: payload.kind };
    case 'task.complete':
    case 'tasks.bulkDelete':
    case 'tasks.completeColumn':
    case 'tasks.archiveCompletedColumn':
      return payload;
    default:
      throw new ApiFailure('INTERNAL_ERROR', 'Invalid task Undo');
  }
}
