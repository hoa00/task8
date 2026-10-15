import type { ReactNode, RefObject } from 'react';
import type { EntityId, TaskDto, UndoDescriptorDto } from '@studio/contracts/api';
export type TaskFieldTarget =
  | { kind: 'record'; workspaceId: EntityId; taskId: EntityId }
  | { kind: 'draft'; draftId: string };
export type TaskFieldValues = Pick<
  TaskDto,
  | 'status'
  | 'priority'
  | 'assigneeId'
  | 'projectId'
  | 'startDate'
  | 'dueDate'
  | 'labelIds'
  | 'estimate'
  | 'recurrence'
  | 'dependencyIds'
>;
export type TaskFieldPatch = Partial<TaskFieldValues>;
export type TaskFormDefaults = Partial<
  Pick<TaskFieldValues, 'dueDate' | 'projectId' | 'assigneeId'>
>;
export type FieldPresentation = 'list-pill' | 'table-cell' | 'drawer-property' | 'form-chip';
export interface FieldControlProps<T> {
  trigger?: ReactNode;
  triggerLabel?: string;
  triggerClassName?: string;
  popupAnchorRef?: RefObject<HTMLElement | null>;
  value: T;
  onChange: (value: T) => Promise<boolean> | boolean;
  disabled?: boolean;
  error?: string | undefined;
  presentation?: FieldPresentation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface TaskFieldCommandModel {
  patch: (patch: TaskFieldPatch) => Promise<boolean>;
  complete: () => Promise<UndoDescriptorDto | null>;
  undo: (descriptor: UndoDescriptorDto) => Promise<boolean>;
  attempt: TaskFieldPatch;
  error: string;
  pending: boolean;
}
