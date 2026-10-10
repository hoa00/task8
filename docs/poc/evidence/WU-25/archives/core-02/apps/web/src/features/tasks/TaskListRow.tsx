import { useRef, useState } from 'react';
import { Checkbox, Icon, IconButton } from '@studio/ui';
import type { DragEvent } from 'react';
import type { TaskDto } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { useStudioQuery } from '../../data/queries';
import { AssigneeField, TaskDateField, TaskLabelsField, TaskPriorityField, TaskProjectField, TaskStatusField } from './fields';
import { useTaskFieldCommands } from './useTaskFieldCommands';
import type { ListColumnId, TaskListModel } from './list-types';
import { useTaskListCommands } from './useTaskListCommands';
export interface TaskListRowProps { task: TaskDto; model: TaskListModel; columns: readonly ListColumnId[]; expanded: boolean; onExpand: () => void; template: string; onDragStart?: (event: DragEvent, task: TaskDto) => void; onDragOver?: (event: DragEvent) => void; onDrop?: (event: DragEvent) => void; onDragEnd: () => void; drop?: 'before' | 'after' | undefined; onComplete: (task: TaskDto) => void }
export function TaskListRow({ task, model, columns, expanded, onExpand, template, onDragStart, onDragOver, onDrop, onDragEnd, drop, onComplete }: TaskListRowProps) {
 const commands = useTaskFieldCommands(task), textCommands = useTaskListCommands(task.workspaceId), { clock } = useDataRuntime();
 const [open, setOpen] = useState<ListColumnId | null>(null), [editing, setEditing] = useState(false), [title, setTitle] = useState(task.title); const submitted = useRef(false);
 const selected = model.selection.selectedIds.includes(task.id), projects = model.data.projects.filter(item => item.access === 'allowed').map(item => item.project);
 const value = { ...task, ...commands.attempt };
 async function commit() { if (submitted.current) return; const next = title.trim(); if (!next || next === task.title) { setEditing(false); return; } submitted.current = true; const result = await textCommands.run('updateTask', { workspaceId: task.workspaceId, taskId: task.id, body: { expectedVersion: task.version, title: next } }); submitted.current = false; if (result) setEditing(false); }
 const control = (column: ListColumnId) => ({ open: open === column, onOpenChange: (next: boolean) => setOpen(next ? column : null), disabled: commands.pending, error: commands.error });
 return <><div className={`task-list-row ${task.status === 'done' ? 'task-done' : ''} ${selected ? 'task-selected' : ''} ${drop ? `task-drop-${drop}` : ''}`} style={{ gridTemplateColumns: template }} data-task-row={task.id} role="row" onContextMenu={event => { if (model.onTaskMenu) { event.preventDefault(); model.onTaskMenu(task.id, event.currentTarget, { x: event.clientX, y: event.clientY }); } }} onDragOver={onDragOver} onDrop={onDrop}>
 <div className="task-handle" draggable={!!onDragStart} onDragStart={event => onDragStart?.(event, task)} onDragEnd={onDragEnd} aria-hidden="true">{onDragStart && <Icon name="grip-vertical" size={14} />}</div>
 <div className="task-c-check"><Checkbox checked={model.selection.kind === 'completion' ? task.status === 'done' : selected} round={model.selection.kind === 'completion'} aria-label={`${model.selection.kind === 'completion' ? 'Mark' : 'Select'} ${task.title}${model.selection.kind === 'completion' ? ' complete' : ''}`} onCheckedChange={() => model.selection.kind === 'completion' ? onComplete(task) : model.selection.onChange(selected ? model.selection.selectedIds.filter(id => id !== task.id) : [...model.selection.selectedIds, task.id])} /></div>
 <div className="task-title-cell" role="button" tabIndex={editing ? -1 : 0} aria-label={`Open ${task.key} ${task.title}`} onKeyDown={event => { if (!editing && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); model.onTaskOpen(task.id); } }} onClick={event => { if (!editing) { event.currentTarget.focus({ preventScroll: true }); model.onTaskOpen(task.id); } }} onDoubleClick={() => { model.onTitleEdit(); setTitle(task.title); setEditing(true); }}>
 {task.subtaskSummary.total ? <IconButton size="xs" className="-ml-1!" aria-label={expanded ? 'Hide subtasks' : 'Show subtasks'} aria-expanded={expanded} onClick={event => { event.stopPropagation(); onExpand(); }}><Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={13} /></IconButton> : <span className="w-[18px] shrink-0" />}
 <span className="task-key">{task.key}</span>{editing ? <input className="task-inline-input" aria-label="Task title" autoFocus ref={element => { if (element && document.activeElement !== element) { element.focus(); element.select(); } }} value={title} aria-busy={textCommands.pending} onClick={event => event.stopPropagation()} onChange={event => setTitle(event.target.value)} onBlur={() => { void commit(); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void commit(); } if (event.key === 'Escape') { submitted.current = true; setEditing(false); queueMicrotask(() => { submitted.current = false; }); } }} /> : <span className="task-title">{task.title}</span>}
 {task.recurrence && <span className="task-meta-mini"><Icon name="repeat" size={11} /></span>}{task.subtaskSummary.total > 0 && <span className="task-meta-mini"><Icon name="list-checks" size={11} />{task.subtaskSummary.completed}/{task.subtaskSummary.total}</span>}{task.commentCount > 0 && <span className="task-meta-mini"><Icon name="message-square" size={11} />{task.commentCount}</span>}
 </div>
 {columns.map(column => <div key={column} className={`task-c-meta task-c-${column}`}>
 {column === 'status' && <TaskStatusField {...control(column)} value={value.status} onChange={status => commands.patch({ status })} />}
 {column === 'assignee' && <AssigneeField {...control(column)} value={value.assigneeId} members={model.data.members} currentMemberId={model.data.currentMember.id} onChange={assigneeId => commands.patch({ assigneeId })} />}
 {column === 'priority' && <TaskPriorityField {...control(column)} value={value.priority} onChange={priority => commands.patch({ priority })} />}
 {column === 'due' && <TaskDateField {...control(column)} field="dueDate" value={value.dueDate} today={clock.today()} weekStart={model.data.preferences.weekStart} overdue={task.status !== 'done' && !!task.dueDate && task.dueDate < clock.today()} onChange={dueDate => commands.patch({ dueDate, ...(dueDate && task.startDate && task.startDate > dueDate ? { startDate: dueDate } : {}) })} />}
 {column === 'labels' && <TaskLabelsField {...control(column)} value={value.labelIds} onChange={labelIds => commands.patch({ labelIds })} />}
 {column === 'project' && <TaskProjectField {...control(column)} value={value.projectId} projects={projects} onChange={projectId => commands.patch({ projectId })} />}
 </div>)}<div className="task-c-more"><IconButton size="sm" aria-label="More actions" aria-disabled={!model.onTaskMenu} onClick={event => model.onTaskMenu?.(task.id, event.currentTarget)}><Icon name="ellipsis" size={15} /></IconButton></div>
 </div>{(commands.error || textCommands.error) && <p className="m-0 text-xs text-red" role="alert">{commands.error || textCommands.error}</p>}{expanded && <TaskSubrows task={task} />}</>;
}
function TaskSubrows({ task }: { task: TaskDto }) {
 const query = useStudioQuery('getTask', { workspaceId: task.workspaceId, taskId: task.id }), commands = useTaskListCommands(task.workspaceId);
 if (!query.data) return <div className="task-subrows">Loading subtasks…</div>;
 const detail = query.data.data;
 return <div className="task-subrows">{detail.subtasks.map(subtask => <div key={subtask.id} className={`task-subrow ${subtask.done ? 'task-done' : ''}`}><Checkbox checked={subtask.done} aria-label={`Complete subtask ${subtask.title}`} disabled={commands.pending} onCheckedChange={done => { void commands.run('updateSubtask', { workspaceId: task.workspaceId, taskId: task.id, subtaskId: subtask.id, body: { expectedTaskVersion: detail.task.version, done } }); }} /><span>{subtask.title}</span></div>)}{commands.error && <p role="alert" className="m-0 text-xs text-red">{commands.error}</p>}</div>;
}
