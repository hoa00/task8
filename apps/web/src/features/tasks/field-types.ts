import type { EntityId, TaskDto } from '@studio/contracts/api';
export type TaskFieldTarget = { kind: 'record'; workspaceId: EntityId; taskId: EntityId } | { kind: 'draft'; draftId: string };
export type TaskFieldValues = Pick<TaskDto, 'status' | 'priority' | 'assigneeId' | 'projectId' | 'startDate' | 'dueDate' | 'labelIds' | 'estimate' | 'recurrence' | 'dependencyIds'>;
export type TaskFieldPatch = Partial<TaskFieldValues>;
export type FieldPresentation = 'list-pill' | 'table-cell' | 'drawer-property' | 'form-chip';
export interface FieldControlProps<T> { value: T; onChange: (value: T) => Promise<boolean> | boolean; disabled?: boolean; error?: string | undefined; presentation?: FieldPresentation; open: boolean; onOpenChange: (open: boolean) => void }
