import type { EntityId, Priority } from '@studio/contracts/api';
import { priorities } from '@studio/contracts/api';
import { ApiFailure } from '../../../shared/errors.ts';
export function priorityWeight(value: Priority): number {
  const priority = value;
  const item = priorities.find((p) => p.id === priority);
  if (!item) throw new ApiFailure('INTERNAL_ERROR', 'Priority is missing');
  return item.weight;
}
export interface OrderEntry {
  readonly id: EntityId;
  readonly position: number;
}
export interface TaskOrderPlan {
  readonly position: number;
  readonly neighbors: readonly { id: EntityId; position: number }[];
}
export function planTaskOrder(
  neighbors: readonly OrderEntry[],
  movingId: EntityId,
  beforeId: EntityId | null | undefined,
  afterId: EntityId | null | undefined,
): TaskOrderPlan {
  let at = neighbors.length;
  if (beforeId) {
    at = neighbors.findIndex((t) => t.id === beforeId);
    if (at < 0) throw new ApiFailure('VALIDATION_ERROR', 'Invalid before neighbor');
  }
  if (afterId) {
    const ai = neighbors.findIndex((t) => t.id === afterId);
    if (ai < 0 || (beforeId && ai + 1 !== at))
      throw new ApiFailure('VALIDATION_ERROR', 'Invalid adjacent neighbors');
    at = ai + 1;
  }
  const lower = neighbors[at - 1]?.position,
    upper = neighbors[at]?.position;
  const position =
    lower === undefined
      ? upper === undefined
        ? 0
        : upper - 100
      : upper === undefined
        ? lower + 100
        : Math.floor((lower + upper) / 2);
  if (
    Number.isSafeInteger(position) &&
    !(lower !== undefined && upper !== undefined && position <= lower)
  )
    return { position, neighbors: [] };
  if (neighbors.length + 1 > 128)
    throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Ordering scope exceeds bounded rebalance');
  const order = [...neighbors];
  order.splice(at, 0, { id: movingId, position: 0 });
  const base = neighbors.length ? Math.min(...neighbors.map((t) => t.position)) : 0;
  const positions = order.map((task, index) => {
    const position = base + index * 100;
    if (!Number.isSafeInteger(position))
      throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Ordering exceeds integer range');
    return { id: task.id, position };
  });
  const moved = positions.find((t) => t.id === movingId);
  if (!moved) throw new ApiFailure('INTERNAL_ERROR', 'Missing moving task');
  return { position: moved.position, neighbors: positions.filter((t) => t.id !== movingId) };
}
