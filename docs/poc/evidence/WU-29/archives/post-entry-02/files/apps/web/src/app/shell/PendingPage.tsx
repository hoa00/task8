import { useLocation } from '@tanstack/react-router';
import { useWorkspaceIntents } from './transient-context';
import { pageNames } from '../navigation';
// Hosts for later owners; Project composition is owned by features/projects.
export function PendingPage() {
  const pathname = useLocation({ select: location => location.pathname });
  const name = pageNames[pathname.split('/').at(-1) ?? ''] ?? 'Project view';
  return <section className="mx-auto max-w-[1160px] px-[var(--gutter)] py-7" data-feature-pending><h1 className="m-0 text-xl font-semibold">{name}</h1><p className="text-secondary">This view will be available soon.</p></section>;
}
export function ShellHarness() {
  const intents = useWorkspaceIntents();
  return <div className="p-6" data-shell-harness><button onClick={() => intents.selectTasks(['harness-selection'])}>Select test item</button><output aria-label="Selection count">{intents.selectedTaskIds.length}</output><div className="h-[1600px]" /></div>;
}
