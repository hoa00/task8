import { captureIntent } from '../../../data/operations';
import { translate as t } from '../../../i18n/i18n';
import { useTranslation } from '../../../i18n/useTranslation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, DialogFooter, Icon, IconButton, Input, KeyHint, Textarea, Toggle } from '@studio/ui';
import { CreateTaskInputSchema } from '@studio/contracts/api';
import type { BootstrapDto, CreateSubtaskDraft, TaskDetailDto, TaskDto } from '@studio/contracts/api';
import { displayFileSize, normalizeDescription, plainDescriptionHtml, sourceFileType } from '@studio/domain';
import { useDataRuntime } from '../../../data/context';
import { queryKeys } from '../../../data/query-keys';
import { Dropzone, FileTypeIcon, UploadProgress } from '../../files/FileFoundation';
import { useSubtaskCommands } from './useSubtaskCommands';
import { TaskPropertyGrid } from './TaskPropertyGrid';
import { TaskSubmission, EditTaskCommit } from './submission';
import type { TaskFieldValues, TaskFormDefaults } from '../field-types';
export interface TaskFormDialogProps { open: boolean; onClose: () => void; data: BootstrapDto; tasks: readonly TaskDto[]; detail?: TaskDetailDto; onSuccess: (taskId: string, key: string, more: boolean) => void; initialState?: 'filled' | 'error' | 'loading'; defaults?: TaskFormDefaults }
export function TaskFormDialog({ open, onClose, data, tasks, detail, onSuccess, initialState, defaults }: TaskFormDialogProps) { useTranslation();
 const { client } = useDataRuntime(), cache = useQueryClient(), titleRef = useRef<HTMLInputElement>(null), busy = useRef<Promise<void> | null>(null), editSaved = useRef<EditTaskCommit | null>(null);
 const [submission] = useState(() => new TaskSubmission(data.workspace.id, data.currentMember.id, detail ? undefined : sessionStorage));
 const opened = useRef(open); useLayoutEffect(() => { opened.current = open; }, [open]);
 const draftGeneration = useRef(0), resetFocusGeneration = useRef<number | null>(null), mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; resetFocusGeneration.current = null; }; }, []);
 const previous = submission.state?.payload, task = detail?.task;
 const [title, setTitle] = useState(previous?.title ?? task?.title ?? (initialState === 'filled' ? 'Prepare launch checklist' : ''));
 const [description, setDescription] = useState(normalizeDescription(previous?.descriptionHtml ?? task?.descriptionHtml ?? (initialState === 'filled' ? '<p>Coordinate the release plan.</p>' : '')).text);
 const [properties, setProperties] = useState<TaskFieldValues>(() => ({ projectId: previous?.projectId ?? task?.projectId ?? data.projects.find(item => item.access === 'allowed')!.project.id, status: previous?.status ?? task?.status ?? 'todo', assigneeId: previous ? previous.assigneeId : task ? task.assigneeId : data.currentMember.id, priority: previous?.priority ?? task?.priority ?? 'medium', startDate: previous?.startDate ?? task?.startDate ?? null, dueDate: previous?.dueDate ?? task?.dueDate ?? null, labelIds: previous?.labelIds ?? task?.labelIds ?? [], recurrence: previous?.recurrence ?? task?.recurrence ?? null, estimate: previous?.estimate ?? task?.estimate ?? null, dependencyIds: previous?.dependencyIds ?? task?.dependencyIds ?? [] }));
 const [children, setChildren] = useState<readonly CreateSubtaskDraft[]>(previous?.subtasks ?? (initialState === 'filled' ? [{ title: t("Confirm launch date"), done: false, assigneeId: null, dueDate: null, note: '' }] : [])), [sub, setSub] = useState(''), [files, setFiles] = useState<readonly File[]>([]);
 const [more, setMore] = useState(false), [openField, setOpenField] = useState<keyof TaskFieldValues | null>(null), [error, setError] = useState(initialState === 'error' ? 'Give the task a name' : ''), [pending, setPending] = useState(initialState === 'loading'), [, redraw] = useState(0), [actionRevision, setActionRevision] = useState(0);
 const frozen = !!submission.state, refresh = () => redraw(n => n + 1);
 const priorOpen = useRef(open && initialState !== undefined);
 useLayoutEffect(() => {
  // A fresh New task intent mirrors source A.newTask. A committed or
  // in-flight submission keeps its frozen payload and recovery identity.
  if (open && !priorOpen.current && !detail && !submission.state && !busy.current) {
   draftGeneration.current++;
   setTitle(''); setDescription(''); setChildren([]); setFiles([]); setSub(''); setError(''); setOpenField(null);
   setProperties({ projectId: defaults?.projectId ?? data.projects.find(item => item.access === 'allowed')!.project.id, status: 'todo', assigneeId: defaults?.assigneeId === undefined ? data.currentMember.id : defaults.assigneeId, priority: 'medium', startDate: null, dueDate: defaults?.dueDate ?? null, labelIds: [], recurrence: null, estimate: null, dependencyIds: [] });
  }
  priorOpen.current = open;
 }, [open, detail, submission, defaults, data]);
 // Create-more reset can commit while submission cleanup still disables the
 // input. Focus the current draft only after React commits an enabled control.
 useLayoutEffect(() => {
  if (!open || resetFocusGeneration.current !== draftGeneration.current) { resetFocusGeneration.current = null; return; }
  const control = titleRef.current;
  if (resetFocusGeneration.current === null || !mounted.current || !control?.isConnected || control.disabled) return;
  resetFocusGeneration.current = null; control.focus();
 });
 async function invalidate(taskId: string) { await cache.invalidateQueries({ queryKey: queryKeys.task(data.workspace.id, taskId) }); await cache.invalidateQueries({ queryKey: queryKeys.workspace(data.workspace.id) }); }
 function reset() { draftGeneration.current++; resetFocusGeneration.current = opened.current ? draftGeneration.current : null; submission.clear(); editSaved.current = null; setTitle(''); setDescription(''); setChildren([]); setFiles([]); setSub(''); setError(''); refresh(); }
 async function addFiles(selected: readonly File[]) {
  if (selected.some(file => file.size > 10485760)) { setError(t("Files must be 10 MiB or smaller")); return; }
  if (frozen) { const generation = draftGeneration.current, state = submission.state; for (const file of selected) { try { const accepted = await submission.reselect(file); if (!mounted.current || draftGeneration.current !== generation || submission.state !== state) return; if (!accepted) setError(t("Select the same file name, type and content to retry this attachment")); } catch (cause) { if (!mounted.current || draftGeneration.current !== generation || submission.state !== state) return; setError(cause instanceof Error ? cause.message : t("The selected file could not be read")); } } refresh(); }
  else setFiles(current => [...current, ...selected]);
 }
 function submit() {
  if (busy.current) return busy.current;
  if (!frozen && !title.trim()) { setError(t("Give the task a name")); titleRef.current?.focus(); return Promise.resolve(); }
  const work = async () => {
   setError(''); setPending(true);
   const intentClient=captureIntent(client);
   try {
    if (!submission.state) { const payload = CreateTaskInputSchema.parse({ ...properties, title, descriptionHtml: task && description === normalizeDescription(task.descriptionHtml).text ? task.descriptionHtml : plainDescriptionHtml(description), subtasks: task ? [] : children, clientRequestId: crypto.randomUUID() }); await submission.freeze(payload, files); }
    const state = submission.state!;
    if (task) {
     const { title: savedTitle, descriptionHtml, status, assigneeId, priority, startDate, dueDate, estimate, recurrence, labelIds, dependencyIds } = state.payload;
     const patch = { title: savedTitle, descriptionHtml, status, assigneeId, priority, startDate, dueDate, estimate, recurrence, labelIds, dependencyIds };
     editSaved.current ??= new EditTaskCommit(task); await editSaved.current.save(intentClient, data.workspace.id, state.payload.projectId, patch, () => cache.invalidateQueries({ queryKey: queryKeys.workspace(data.workspace.id) }));
     submission.bindTask(task.id, task.key);
    }
    const complete = await submission.run(intentClient, refresh, invalidate); refresh();
    if (!mounted.current) return;
    if (!complete) { setError(t("Task {{value1}} has been saved. Some attachments need retry.", { value1: String(state.taskKey ?? '') })); return; }
    onSuccess(state.taskId!, state.taskKey!, !task && more);
    if (!task) { reset(); if (!more && opened.current) onClose(); } else { submission.clear(); refresh(); if (opened.current) onClose(); }
   } catch (cause) { setError(cause instanceof Error ? cause.message : t("The task could not be saved")); }
   finally { setPending(false); }
  };
  busy.current = work().finally(() => { busy.current = null; }); return busy.current;
 }
 return <Dialog open={open} entryRevision={`${actionRevision}/${openField}/${error}/${pending}`} initialFocus={titleRef} aria-labelledby="task-form-title" onOpenChange={next => { if (!next) onClose(); }} data-task-form={task ? 'edit' : 'create'} onClickCapture={event => { const button = event.target instanceof Element ? event.target.closest('button') : null; if (button && button.getAttribute('role') !== 'switch') setActionRevision(current => current + 1); }} onChangeCapture={event => { if (event.target instanceof HTMLInputElement && event.target.type === 'file') setActionRevision(current => current + 1); }} onKeyDownCapture={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.getAttribute('aria-label') === 'Draft subtask' && event.target.value.trim()) setActionRevision(current => current + 1); }} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void submit(); } }}><div className="flex items-center gap-2 px-4 pt-[14px]"><div><h2 id="task-form-title" className="m-0 text-md font-semibold">{task ? t("Edit task") : t("New task")}</h2>{task && <div className="mt-[2px] text-[12.5px] text-secondary"><span className="font-mono text-[.92em] tracking-[-.01em]">{task.key}</span></div>}</div><IconButton size="sm" aria-label={t("Close")} className="ml-auto" onClick={onClose}><Icon name="x" size={16} /></IconButton></div><form className="flex flex-col gap-3 overflow-y-auto px-4 py-[14px]" onSubmit={event => { event.preventDefault(); void submit(); }}>
 <div className="flex flex-col gap-[6px]"><label className="sr-only" htmlFor="task-form-name">{t("Task name")}</label><Input ref={titleRef} id="task-form-name" size="lg" className="py-0 text-[15px]! font-medium ease-[ease]" value={title} placeholder={t("Task name")} disabled={frozen || pending} aria-invalid={!!error} aria-describedby={error ? 'task-form-error' : undefined} onChange={event => { setTitle(event.target.value); if (error === 'Give the task a name' && event.target.value.trim()) setError(''); }} />{error && <span id="task-form-error" className="flex items-center gap-1 text-xs text-red" role="alert"><Icon name="circle-alert" size={12} />{error}</span>}</div>
 <div className="flex flex-col gap-[6px]"><label className="sr-only" htmlFor="task-form-description">{t("Description")}</label><Textarea className="disabled:bg-surface!" id="task-form-description" value={description} rows={3} placeholder={t("Add a description… (optional)")} disabled={frozen || pending} onChange={event => setDescription(event.target.value)} /></div>
 <TaskPropertyGrid form value={properties} data={data} tasks={tasks} onPatch={patch => { setProperties(value => ({ ...value, ...patch })); return true; }} openField={openField} onOpenFieldChange={setOpenField} disabled={frozen || pending} />
 {task ? <EditSubtaskControls detail={detail!} disabled={frozen || pending} /> : <div className="flex flex-col gap-[6px]"><span className="text-sm font-medium">{t("Subtasks")}</span>{children.map((child, i) => <div key={i} className="flex min-h-8 items-center gap-[9px] rounded-sm px-1 text-body"><Icon name="circle" size={13} /><span className="min-w-0 flex-1 truncate">{child.title}</span><IconButton size="xs" aria-label={t("Remove subtask {{value1}}", { value1: String(child.title) })} disabled={frozen || pending} onClick={() => setChildren(current => current.filter((_, index) => index !== i))}><Icon name="x" size={12} /></IconButton></div>)}<div className="relative"><Icon name="plus" size={14} className="pointer-events-none absolute left-[9px] top-1/2 -translate-y-1/2 text-faint" /><Input className="pl-[30px]!" value={sub} placeholder={t("Add a subtask and press Enter")} aria-label={t("Draft subtask")} disabled={frozen || pending} onChange={event => setSub(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (sub.trim()) { setChildren(current => [...current, { title: sub.trim(), done: false, assigneeId: null, dueDate: null, note: '' }]); setSub(''); } } }} /></div></div>}
 <div className="flex flex-col gap-[6px]"><span className="text-sm font-medium">{t("Attachments")}</span>
 {submission.state?.prepared ? submission.state.files.map(intent => intent.status === 'uploading' ? <UploadProgress key={intent.requestId} name={intent.name} percent={null} /> : <div key={intent.requestId} className="flex flex-wrap items-center gap-[10px] rounded-default border border-solid border-border px-[10px] py-[6px] text-sm" data-file-intent={intent.requestId} data-status={intent.status}><FileTypeIcon type={sourceFileType(intent.name)} small /><span className="grow truncate">{intent.name}</span><span className="text-[11.5px] text-muted">{displayFileSize(intent.size)}</span><span className="text-xs">{intent.status}</span>{intent.status !== 'attached' && <IconButton size="xs" aria-label={t("Remove failed {{value1}}", { value1: String(intent.name) })} disabled={pending} onClick={() => { submission.removeFailed(intent.requestId); refresh(); }}><Icon name="x" size={12} /></IconButton>}{intent.error && <span className="w-full text-xs text-red">{intent.error}</span>}</div>) : files.map((file, i) => <div key={i} className="flex items-center gap-[10px] rounded-default border border-solid border-border px-[10px] py-[6px] text-sm"><FileTypeIcon type={sourceFileType(file.name)} small /><span className="grow truncate">{file.name}</span><span className="text-[11.5px] text-muted">{displayFileSize(file.size)}</span><IconButton size="xs" aria-label={t("Remove draft file {{value1}}", { value1: String(file.name) })} onClick={() => setFiles(current => current.filter((_, index) => index !== i))}><Icon name="x" size={12} /></IconButton></div>)}
 <Dropzone padding={10} label={frozen ? t("Select files again to retry") : t("Attach files")} disabled={pending} onFiles={selected => { void addFiles(selected); }} /></div><button type="submit" hidden />
 </form><DialogFooter>{!task && <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-secondary"><Toggle checked={more} onCheckedChange={setMore} />{t("Create more")}</label>}<span className="grow" /><span className="task-hide-mobile flex gap-[3px] text-[11.5px] text-muted"><KeyHint>⌘</KeyHint><KeyHint>↵</KeyHint></span><Button onClick={onClose}>{t("Cancel")}</Button>{frozen && !pending && <Button onClick={reset}>{t("Start new draft")}</Button>}<Button variant="primary" loading={pending} onClick={() => { void submit(); }}>{submission.state?.taskId ? t("Retry failed") : task ? t("Save changes") : t("Create task")}</Button></DialogFooter></Dialog>;
}

function EditSubtaskControls({detail,disabled}:{detail:TaskDetailDto;disabled:boolean}) { useTranslation(); const commands=useSubtaskCommands(detail.task),[title,setTitle]=useState(''); return <div className="flex flex-col gap-[6px]"><span className="text-sm font-medium">{t("Subtasks")}</span>{detail.subtasks.map(child=><div key={child.id} className="flex min-h-8 items-center gap-[9px] rounded-sm px-1 text-body"><Icon name="circle" size={13}/><span className="min-w-0 flex-1 truncate">{child.title}</span><IconButton size="xs" aria-label={t("Remove subtask {{value1}}", { value1: String(child.title) })} disabled={disabled||commands.pending} onClick={()=>{void commands.remove(child.id);}}><Icon name="x" size={12}/></IconButton></div>)}<div className="relative"><Icon name="plus" size={14} className="pointer-events-none absolute left-[9px] top-1/2 -translate-y-1/2 text-faint"/><Input className="pl-[30px]!" value={title} placeholder={t("Add a subtask and press Enter")} aria-label={t("Draft subtask")} disabled={disabled||commands.pending} onChange={event=>setTitle(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(title.trim())void commands.create(title).then(result=>{if(result)setTitle('');});}}}/></div>{commands.error&&<p role="alert" className="text-xs text-red">{commands.error}</p>}</div>; }
