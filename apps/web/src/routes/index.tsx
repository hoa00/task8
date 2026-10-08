import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: WorkspaceEntry });

function WorkspaceEntry() {
  return <main className="min-h-screen" aria-label="task8 workspace" />;
}
