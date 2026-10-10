import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Dialog, DialogBody, DialogFooter, EmptyState, Icon, IconButton, Panel, Tabs, TaskStatusIcon, Tooltip } from '@studio/ui';
import type { ArchiveItemDto, ProjectDto, TaskDto } from '@studio/contracts/api';
import { projectStatuses } from '@studio/contracts/api';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useDataRuntime } from '../../data/context';
import { operationQueryKey } from '../../data/query-keys';
import { useProjectCommands } from '../projects/useProjectCommands';
import { useProjectIntents } from '../projects/project-intents';
import { ago } from '../tasks/date-display';
import { loadArchive } from './loadArchive';
import { SkeletonRows } from '../dev/Skeletons';

export interface ArchivedRowProps { item: ArchiveItemDto; projectName?: string | undefined; now: string; pending: boolean; onRestore: () => void; onDelete: () => void }
export function ArchivedRow({ item, projectName, now, pending, onRestore, onDelete }: ArchivedRowProps) {
  const entity = item.kind === 'tasks' ? item.task : item.project.project, title = item.kind === 'tasks' ? item.task.title : item.project.project.name;
  const archivedAt = 'archivedAt' in entity ? entity.archivedAt : null;
  const anchor = useRef<HTMLButtonElement>(null), [tip, setTip] = useState(false);
  return <div className="task-mini min-h-[52px]! cursor-default! gap-3!" data-archived-row={entity.id}>
    {item.kind === 'tasks' ? <TaskStatusIcon status={item.task.status} size={15}/> : <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px]" style={{ color: item.project.project.color, background: `color-mix(in srgb,${item.project.project.color} 16%,transparent)` }}><Icon name={item.project.project.icon} size={14}/></span>}
    <div className="min-w-0 flex-1"><div className="truncate font-medium">{title}</div><div className="truncate text-xs text-muted">{item.kind === 'tasks' ? <><span className="font-mono">{item.task.key}</span> · {projectName}</> : <>{item.project.access === 'allowed' ? item.project.summary.taskSummary.total : 0} tasks · {projectStatuses.find(row => row.id === item.project.project.status)?.name}</>}</div></div>
    <span className="task-hide-mobile whitespace-nowrap text-xs text-muted">{archivedAt ? `Archived ${ago(archivedAt, now)}` : 'Archived'}</span>
    <Button size="sm" disabled={pending} onClick={onRestore}><Icon name="rotate-ccw" size={13}/>Restore</Button>
    <IconButton ref={anchor} size="sm" className="text-red" aria-label={`Delete ${title}`} disabled={pending} onClick={onDelete}><Icon name="trash-2" size={15}/></IconButton><Tooltip anchor={anchor} open={tip} onOpenChange={setTip} label="Delete"/>
  </div>;
}
export function ArchivePage() {
  const workspaceId = useWorkspaceId(), bootstrap = useWorkspaceBootstrap().data!.data, { client, clock } = useDataRuntime(), tasks = useWorkspaceIntents(), projects = useProjectIntents(), commands = useProjectCommands(workspaceId);
  const [tab, setTab] = useState('tasks'), [deleteTask, setDeleteTask] = useState<TaskDto | null>(null), cancel = useRef<HTMLButtonElement>(null), busy = useRef(false);
  const query = (kind: 'tasks' | 'projects') => ({ queryKey: [...operationQueryKey('listArchive', { workspaceId, query: { kind } }), 'complete'], queryFn: ({ signal }: { signal: AbortSignal }) => loadArchive(client, workspaceId, kind, signal) });
  const archivedTasks = useQuery(query('tasks')), archivedProjects = useQuery(query('projects')), current = tab === 'tasks' ? archivedTasks : archivedProjects;
  async function restore(item: ArchiveItemDto) {
    if (busy.current) return; busy.current = true;
    try {
      if (item.kind === 'tasks') { const result = await commands.run('restoreTask', { workspaceId, taskId: item.task.id, body: { expectedVersion: item.task.version } }); if (result) projects.notice(`Restored “${result.data.task.title}”`, undefined, { action: { label: 'Open', onAction: () => tasks.openTask(result.data.task.id) } }); }
      else { const project = item.project.project as ProjectDto; const result = await commands.run('restoreProject', { workspaceId, projectId: project.id, body: { expectedVersion: project.version } }); if (result) projects.notice(`Restored ${result.data.project.name}`); }
    } finally { busy.current = false; }
  }
  return <div className="mx-auto w-full max-w-[1160px] px-[var(--gutter)] pt-7 pb-[72px] max-[900px]:pt-5 max-[900px]:pb-24 max-w-[900px]!" data-archive-page>
    <div className="mb-5 flex flex-wrap items-start gap-3 [&_h1]:m-0 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-[1.2] [&_h1]:tracking-[-.022em] [&_h1]:[text-wrap:balance] [&_p]:mb-0 [&_p]:mt-1 [&_p]:text-body [&_p]:text-secondary max-[900px]:[&_h1]:text-xl [&>button]:ml-auto [&>[role=radiogroup]]:ml-auto max-[900px]:[&>button]:ml-0 max-[900px]:[&>[role=radiogroup]]:ml-0"><div><h1>Archive</h1><p>Archived work is hidden everywhere else. Restore it any time, or delete it.</p></div></div>
    <Tabs className="mb-[14px]" label="Archive" value={tab} onValueChange={setTab} items={[{ value: 'tasks', label: 'Tasks', count: archivedTasks.data?.length ?? 0 }, { value: 'projects', label: 'Projects', count: archivedProjects.data?.length ?? 0 }]}/>
    {commands.error && <Alert tone="danger">{commands.error}<Button size="sm" onClick={() => { commands.clearError(); void archivedTasks.refetch(); void archivedProjects.refetch(); }}>Refresh</Button></Alert>}
    {current.error ? <Panel><EmptyState icon="cloud-alert" error heading="Something went wrong." description="This page failed to load. Your data is safe — try again in a moment." action={<Button onClick={() => { void current.refetch(); }}>Try again</Button>}/></Panel> : current.isPending ? <div aria-busy="true"><SkeletonRows count={8}/></div> : <Panel className="overflow-hidden">{current.data?.length ? current.data.map(item => <ArchivedRow key={item.kind === 'tasks' ? item.task.id : item.project.project.id} item={item} projectName={item.kind === 'tasks' ? bootstrap.projects.find(row => row.project.id === item.task.projectId)?.project.name : undefined} now={clock.now()} pending={commands.pending} onRestore={() => void restore(item)} onDelete={() => { commands.clearError(); if (item.kind === 'tasks') setDeleteTask(item.task); else projects.deleteProject(item.project.project as ProjectDto); }}/>) : <EmptyState icon="archive" heading={`No archived ${tab}`} description={tab === 'tasks' ? 'Archive finished or abandoned tasks to keep boards focused. They wait here until you restore them.' : 'Archived projects disappear from the sidebar and project lists but keep every task, file, and comment.'}/>}</Panel>}
    {deleteTask && <Dialog open size="sm" initialFocus={cancel} entryRevision={commands.error} aria-labelledby="archive-delete-title" onOpenChange={open => { if (!open && !commands.pending) setDeleteTask(null); }}><DialogBody className="pt-[18px]! gap-[10px]!"><div className="flex items-start gap-3"><span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-red-soft text-red"><Icon name="trash-2" size={17}/></span><div className="min-w-0 flex-1"><h2 className="mt-1 mb-[6px] text-[15px] font-semibold" id="archive-delete-title">Delete archived task?</h2><p className="m-0 text-sm leading-[1.55] text-secondary"><b>{deleteTask.title}</b>, its subtasks, comments, and attachments will be hidden for everyone. Permanent deletion is unavailable.</p></div></div>{commands.error && <Alert tone="danger">{commands.error}</Alert>}</DialogBody><DialogFooter><span className="flex-1"/><Button ref={cancel} disabled={commands.pending} onClick={() => setDeleteTask(null)}>Cancel</Button><Button variant="danger" loading={commands.pending} onClick={async () => { if (busy.current) return; busy.current = true; try { const result = await commands.run('deleteTask', { workspaceId, taskId: deleteTask.id, body: { expectedVersion: deleteTask.version } }); if (result) { setDeleteTask(null); projects.notice(`Deleted “${deleteTask.title}”`); } } finally { busy.current = false; } }}>Delete task</Button></DialogFooter></Dialog>}
  </div>;
}
