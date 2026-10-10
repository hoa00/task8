import { createContext, useContext } from 'react';

export interface TaskCommentDraft { value: string; revision: number }
export interface TaskCommentDraftStore { drafts: Readonly<Record<string, TaskCommentDraft>>; changeDraft: (taskId: string, value: string, expectedRevision?: number) => void }
export const TaskCommentDraftContext = createContext<TaskCommentDraftStore | null>(null);

// Standalone drawer QA keeps its existing controlled draft owner. Production
// Inbox and Drawer consume the same workspace provider.
export function useTaskCommentDraftStore() { return useContext(TaskCommentDraftContext); }
