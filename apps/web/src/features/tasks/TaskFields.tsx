import type { DateOnly, MemberDisplayDto, ProjectDto, TaskDto } from '@studio/contracts/api';
import type {
  TaskFieldPatch,
  TaskFieldTarget,
  TaskFieldValues,
  FieldPresentation,
} from './field-types';
import {
  AssigneeField,
  TaskDateField,
  TaskDependenciesField,
  TaskEstimateField,
  TaskLabelsField,
  TaskPriorityField,
  TaskProjectField,
  TaskRecurrenceField,
  TaskStatusField,
} from './fields';
export interface TaskFieldsProps {
  target: TaskFieldTarget;
  value: TaskFieldValues;
  onPatch: (target: TaskFieldTarget, patch: TaskFieldPatch) => Promise<boolean> | boolean;
  members: readonly MemberDisplayDto[];
  projects: readonly ProjectDto[];
  tasks: readonly TaskDto[];
  currentMemberId: string;
  today: DateOnly;
  weekStart: 0 | 1 | 6;
  openField: keyof TaskFieldValues | null;
  onOpenFieldChange: (field: keyof TaskFieldValues | null) => void;
  presentation: FieldPresentation;
  error?: string;
  disabled?: boolean;
}
export function TaskFields({
  target,
  value,
  onPatch,
  members,
  projects,
  tasks,
  currentMemberId,
  today,
  weekStart,
  openField,
  onOpenFieldChange,
  presentation,
  error,
  disabled,
}: TaskFieldsProps) {
  function control<K extends keyof TaskFieldValues>(field: K) {
    return {
      value: value[field],
      onChange: (next: TaskFieldValues[K]) =>
        onPatch(
          target,
          field === 'dueDate' &&
            target.kind === 'record' &&
            typeof next === 'string' &&
            value.startDate &&
            String(value.startDate) > String(next)
            ? {
                dueDate: next as TaskFieldValues['dueDate'],
                startDate: next as TaskFieldValues['startDate'],
              }
            : { [field]: next },
        ),
      open: openField === field,
      onOpenChange: (open: boolean) => onOpenFieldChange(open ? field : null),
      presentation,
      error,
      disabled: !!disabled,
    };
  }
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-field-target={target.kind === 'record' ? target.taskId : target.draftId}
    >
      <TaskStatusField {...control('status')} />
      <TaskPriorityField {...control('priority')} />
      <AssigneeField
        {...control('assigneeId')}
        members={members}
        currentMemberId={currentMemberId}
      />
      <TaskDateField
        {...control('dueDate')}
        field="dueDate"
        today={today}
        weekStart={weekStart}
        overdue={value.status !== 'done' && !!value.dueDate && value.dueDate < today}
      />
      <TaskDateField
        {...control('startDate')}
        field="startDate"
        today={today}
        weekStart={weekStart}
      />
      <TaskProjectField {...control('projectId')} projects={projects} />
      <TaskLabelsField {...control('labelIds')} />
      <TaskRecurrenceField {...control('recurrence')} />
      <TaskEstimateField {...control('estimate')} />
      <TaskDependenciesField
        {...control('dependencyIds')}
        tasks={tasks}
        {...(target.kind === 'record' ? { taskId: target.taskId } : {})}
        projectId={value.projectId}
      />
    </div>
  );
}
