import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useLayoutEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, RefObject } from 'react';
import { Icon } from '@studio/ui';
import { UpdateTaskInputSchema, priorities, estimates } from '@studio/contracts/api';
import type { TaskDto } from '@studio/contracts/api';
import type { TaskColumnId } from '@studio/domain';
import { useDataRuntime } from '../../data/context';
import { MemberIdentity } from '../people/MemberIdentity';
import { TaskLabel, TaskStatusIcon, PriorityIcon } from './atoms';
import { AssigneeField, TaskDateField, TaskDependenciesField, TaskLabelsField, TaskPriorityField, TaskProjectField, TaskStatusField } from './fields';
import { useTaskFieldCommands } from './useTaskFieldCommands';
import { useTaskListCommands } from './useTaskListCommands';
import { formatTaskDate } from './date-display';
import type { TaskTableModel } from './table-types';

import { formatAbsoluteDate as absoluteDate } from './date-display';
const dash = <span className="text-muted">—</span>;
export interface TaskTableRowProps { task: TaskDto; model: TaskTableModel; columns: readonly TaskColumnId[] }
export function TaskTableRow({ task, model, columns }: TaskTableRowProps) { useTranslation();
  const { clock } = useDataRuntime(), commands = useTaskFieldCommands(task), textCommands = useTaskListCommands(task.workspaceId);
  const [open, setOpen] = useState<TaskColumnId | null>(null), [editing, setEditing] = useState<'title' | 'estimate' | null>(null), [draft, setDraft] = useState(''), [validation, setValidation] = useState('');
  const submitted = useRef(false), canceling = useRef(false), value = { ...task, ...commands.attempt };
  const projects = model.data.projects.filter(item => item.access === 'allowed').map(item => item.project), member = model.data.members.find(member => member.id === value.assigneeId) ?? null, project = projects.find(project => project.id === value.projectId);
  const control = (field: TaskColumnId, popupAnchorRef: RefObject<HTMLTableCellElement | null>) => ({ popupAnchorRef, open: open === field, onOpenChange: (next: boolean) => setOpen(next ? field : null), disabled: commands.pending, error: commands.error, presentation: 'table-cell' as const, triggerClassName: 'task-table-field' });
  function edit(field: 'title' | 'estimate') { if (textCommands.pending) return; model.onTitleEdit(); setOpen(null); setDraft(field === 'title' ? task.title : task.estimate ?? ''); setValidation(''); textCommands.clearError(); setEditing(field); }
  async function commit() {
    if (!editing || submitted.current || canceling.current) return;
    const next = draft.trim(), field = editing;
    if (next === (field === 'title' ? task.title : task.estimate ?? '')) { setEditing(null); return; }
    const body = { expectedVersion: task.version, [field]: next || (field === 'estimate' ? null : '') }, parsed = UpdateTaskInputSchema.safeParse(body);
    if (!parsed.success) { setValidation(field === 'title' ? t("Enter a task title (1–240 characters).") : t("Choose a supported estimate: {{value1}}.", { value1: String(estimates.join(', ')) })); return; }
    submitted.current = true; setValidation('');
    const result = await textCommands.run('updateTask', { workspaceId: task.workspaceId, taskId: task.id, body: parsed.data });
    submitted.current = false; if (result) setEditing(null);
  }
  const cellError = validation || textCommands.error;
  return <><tr data-table-task={task.id} data-task-key={task.key} onContextMenu={event => { if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable]')) return; event.preventDefault(); model.onTaskMenu(task.id, event.currentTarget, { x: event.clientX, y: event.clientY }); }}>{columns.map(column => {
    if (column === 'title' || column === 'estimate') return <td key={column} className={`${column === 'title' ? 'task-table-sticky' : editing === column ? '' : 'tabular-nums'} ${editing === column ? 'task-table-editing' : 'task-table-cell'}`} title={column === 'title' ? t("Double-click to rename") : t("Click to edit")} onClick={event => { if (editing) return; if (column === 'estimate') edit(column); else { event.currentTarget.focus({ preventScroll: true }); model.onTaskOpen(task.id); } }} onDoubleClick={() => edit(column)} tabIndex={editing === column ? undefined : 0} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter') { event.preventDefault(); if (column === 'estimate') edit(column); else model.onTaskOpen(task.id); } if (event.key === 'F2') { event.preventDefault(); edit(column); } }}>
      {editing === column ? <TaskTableInlineInput key={column} aria-label={column === 'title' ? t("Title") : t("Estimate")} placeholder={column === 'estimate' ? t("e.g. 2d") : undefined} value={draft} aria-invalid={!!cellError} aria-busy={textCommands.pending} disabled={textCommands.pending} onClick={event => event.stopPropagation()} onChange={event => { setDraft(event.target.value); setValidation(''); }} onBlur={() => { void commit(); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void commit(); } if (event.key === 'Escape' && !textCommands.pending) { event.preventDefault(); canceling.current = true; setEditing(null); queueMicrotask(() => { canceling.current = false; }); } }} /> : column === 'title' ? <span className="flex items-center gap-2"><TaskStatusIcon status={task.status} size={13} /><span className="min-w-0 truncate font-[450]">{task.title}</span><span className="ml-auto font-mono text-[11px] tracking-[-.01em] text-muted">{task.key}</span></span> : task.estimate || dash}</td>;
    return <TaskTableFieldCell key={column} column={column} onPaddingClick={() => { if (!commands.pending && column !== 'created') setOpen(current => current === column ? null : column); }}>{anchor => <>
      {column === 'status' && <TaskStatusField {...control(column, anchor)} value={value.status} onChange={status => commands.patch({ status })} />}
      {column === 'priority' && <TaskPriorityField {...control(column, anchor)} value={value.priority} onChange={priority => commands.patch({ priority })} />}
      {column === 'assignee' && <AssigneeField {...control(column, anchor)} value={value.assigneeId} members={model.data.members} currentMemberId={model.data.currentMember.id} trigger={<><MemberIdentity member={member} avatarOnly /><span className={`min-w-0 truncate ${member ? '' : 'text-muted'}`}>{member?.name ?? t('Unassigned')}</span></>} onChange={assigneeId => commands.patch({ assigneeId })} />}
      {(column === 'due' || column === 'start') && <TaskDateField {...control(column, anchor)} value={column === 'due' ? value.dueDate : value.startDate} field={column === 'due' ? 'dueDate' : 'startDate'} today={clock.today()} weekStart={model.data.preferences.weekStart} trigger={<span className={column === 'due' && task.status !== 'done' && value.dueDate && value.dueDate < clock.today() ? 'text-red' : ''}>{(column === 'due' ? value.dueDate : value.startDate) ? absoluteDate((column === 'due' ? value.dueDate : value.startDate)!) : dash}</span>} onChange={date => commands.patch(column === 'due' ? { dueDate: date, ...(date && value.startDate && value.startDate > date ? { startDate: date } : {}) } : { startDate: date, ...(date && value.dueDate && value.dueDate < date ? { dueDate: date } : {}) })} />}
      {column === 'labels' && <TaskLabelsField {...control(column, anchor)} triggerClassName="task-table-field gap-1!" value={value.labelIds} trigger={<span className="contents">{value.labelIds.length ? value.labelIds.map(id => <TaskLabel key={id} id={id} />) : dash}</span>} onChange={labelIds => commands.patch({ labelIds })} />}
      {column === 'deps' && <TaskDependenciesField {...control(column, anchor)} value={value.dependencyIds} tasks={model.dependencyTasks} projectId={task.projectId} taskId={task.id} trigger={<span>{value.dependencyIds.length ? value.dependencyIds.map(id => { const dependency = model.dependencyTasks.find(task => task.id === id); return dependency ? <span key={id} className="task-table-dependency" title={dependency.title}>{dependency.key}</span> : null; }) : dash}</span>} onChange={dependencyIds => commands.patch({ dependencyIds })} />}
      {column === 'created' && absoluteDate(task.createdAt)}
      {column === 'project' && <TaskProjectField {...control(column, anchor)} value={value.projectId} projects={projects} trigger={<><span className="size-2 shrink-0 rounded-[3px]" style={{ background: project?.color }} /><span className="min-w-0 truncate">{project?.name}</span></>} onChange={projectId => commands.patch({ projectId })} />}
    </>}</TaskTableFieldCell>;
  })}</tr>{(cellError || commands.error) && <tr><td colSpan={columns.length}><p role="alert" className="m-0 text-xs text-red">{cellError || commands.error}</p></td></tr>}</>;
}
export interface TaskTableFieldCellProps { column: TaskColumnId; onPaddingClick: () => void; children: (anchor: RefObject<HTMLTableCellElement | null>) => ReactNode }
function TaskTableFieldCell({ column, onPaddingClick, children }: TaskTableFieldCellProps) { useTranslation();
  const anchor = useRef<HTMLTableCellElement>(null);
  return <td ref={anchor} className={`${column !== 'created' ? 'task-table-cell' : 'text-secondary'} ${['due', 'start', 'created'].includes(column) ? 'tabular-nums' : ''}`} onClick={event => { if (event.target === event.currentTarget) onPaddingClick(); }}>{children(anchor)}</td>;
}
export interface TaskTableMobileCardProps { task: TaskDto; model: TaskTableModel }
export function TaskTableMobileCard({ task, model }: TaskTableMobileCardProps) { useTranslation();
  const { clock } = useDataRuntime(), member = model.data.members.find(member => member.id === task.assigneeId) ?? null, priority = priorities.find(priority => priority.id === task.priority)!;
  return <div className="task-table-mobile-card" data-table-mobile-task={task.id} data-task-key={task.key} role="button" tabIndex={0} aria-label={task.title} onClick={event => { event.currentTarget.focus({ preventScroll: true }); model.onTaskOpen(task.id); }} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); model.onTaskOpen(task.id); } }}><div className="mb-2 flex items-center gap-2"><TaskStatusIcon status={task.status} /><b className="min-w-0 flex-1 font-medium">{task.title}</b><span className="font-mono text-[11px] tracking-[-.01em] text-muted">{task.key}</span></div><div className="flex flex-wrap items-center gap-[10px] text-xs"><PriorityIcon priority={task.priority} /><span>{t(priority.name)}</span><MemberIdentity member={member} avatarOnly /><span className="text-secondary">{member?.name ?? t('Unassigned')}</span>{task.dueDate && <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs tabular-nums ${task.status !== 'done' && task.dueDate < clock.today() ? 'text-red' : task.status !== 'done' && task.dueDate <= new Date(Date.parse(clock.today()) + 86400000).toISOString().slice(0, 10) ? 'text-amber' : 'text-secondary'}`}><Icon name="calendar" size={12} />{formatTaskDate(task.dueDate, clock.today())}</span>}{task.estimate && <span className="text-muted"><Icon name="timer" size={12} /> {task.estimate}</span>}</div></div>;
}

export type TaskTableInlineInputProps = InputHTMLAttributes<HTMLInputElement>;
function TaskTableInlineInput(props: TaskTableInlineInputProps) { useTranslation();
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return <input {...props} ref={input} />;
}
