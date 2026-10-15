import { normalizeTaskView } from '@studio/domain';
import type { TaskViewState } from '@studio/domain';
// Current configuration is URL/UI state. Named views are explicit server records;
// neither conversion nor editing invokes a saved-view write operation.
export function decodeCurrentTaskView(search: string): TaskViewState {
  try {
    const value = new URLSearchParams(search).get('view');
    const parsed: unknown = value ? JSON.parse(value) : {};
    const decoded: unknown = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    return normalizeTaskView(decoded as Parameters<typeof normalizeTaskView>[0]);
  } catch {
    return normalizeTaskView();
  }
}
export function encodeCurrentTaskView(view: TaskViewState): string {
  const params = new URLSearchParams();
  params.set('view', JSON.stringify(normalizeTaskView(view)));
  return params.toString();
}
