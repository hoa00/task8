// Standalone QA entry adapter. Production route state uses TanStack Router.
import { useSyncExternalStore } from 'react';
import type { TaskViewState } from '@studio/domain';
import { decodeCurrentTaskView, encodeCurrentTaskView } from '../features/tasks/current-view';
const subscribe = (change: () => void) => {
  window.addEventListener('popstate', change);
  return () => window.removeEventListener('popstate', change);
};
function replace(key: string, value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
export function useHarnessView() {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => '',
  );
  return {
    controlledView: decodeCurrentTaskView(search),
    onCurrentViewChange: (view: TaskViewState) =>
      replace('view', new URLSearchParams(encodeCurrentTaskView(view)).get('view')!),
    onModeChange: (mode: 'list' | 'board' | 'table' | 'calendar') => replace('mode', mode),
  };
}
