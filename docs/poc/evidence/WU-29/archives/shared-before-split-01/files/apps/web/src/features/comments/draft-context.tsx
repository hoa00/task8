import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface TaskCommentDraft { value: string; revision: number }
interface TaskCommentDraftStore { drafts: Readonly<Record<string, TaskCommentDraft>>; changeDraft: (taskId: string, value: string, expectedRevision?: number) => void }
const TaskCommentDraftContext = createContext<TaskCommentDraftStore | null>(null);

// Mounted once per workspace by AppShell. This cache contains unposted UI text;
// canonical comments remain in Query. A late post clears only its own revision.
export function TaskCommentDraftProvider({ children }: { children: ReactNode }) {
 const [drafts, setDrafts] = useState<Record<string, TaskCommentDraft>>({});
 const changeDraft = useCallback((taskId: string, value: string, expectedRevision?: number) => {
  setDrafts(previous => {
   const revision = previous[taskId]?.revision ?? 0;
   return expectedRevision !== undefined && revision !== expectedRevision ? previous : { ...previous, [taskId]: { value, revision: revision + 1 } };
  });
 }, []);
 const store = useMemo(() => ({ drafts, changeDraft }), [drafts, changeDraft]);
 return <TaskCommentDraftContext value={store}>{children}</TaskCommentDraftContext>;
}

// Standalone drawer QA keeps its existing controlled draft owner. Production
// Inbox and Drawer consume the same workspace provider.
export function useTaskCommentDraftStore() { return useContext(TaskCommentDraftContext); }
