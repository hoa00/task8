import { useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Dialog, DialogBody, ToastViewport } from '@studio/ui';
import { EntityIdSchema } from '@studio/contracts/api';
import type { ToastMessage } from '@studio/ui';
import type { BootstrapDto, UndoDescriptorDto } from '@studio/contracts/api';
import { links, validateRouteSearch } from '../../app/navigation';
import { useDataRuntime } from '../../data/context';
import { studioQueryOptions } from '../../data/queries';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useProjectIntents } from '../projects/project-intents';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
import { useCompleteMembers } from '../people/catalogue';
import { FilePreviewDialog } from './FileFoundation';
import { FileIntentContext } from './file-intents';
export interface FileOverlayHostProps { data: BootstrapDto; children: ReactNode }
export function FileOverlayHost({ data, children }: FileOverlayHostProps) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]), [retryUndo, setRetryUndo] = useState<UndoDescriptorDto | null>(null), commands = useTaskListCommands(data.workspace.id);
  async function undo(descriptor: UndoDescriptorDto) { const result = await commands.undo(descriptor); setRetryUndo(result ? null : descriptor); }
  const { client, clock } = useDataRuntime(), location = useLocation(), navigate = useNavigate(), tasks = useWorkspaceIntents(), projects = useProjectIntents(), search = validateRouteSearch(location.search);
  const route = location.pathname.match(/^\/w\/([^/]+)\/projects\/([^/]+)\/files$/), projectId = route?.[2], requested = !!route && Object.hasOwn(location.search, 'fileId'), fileId = search.fileId;
  const scopedRoute = route?.[1] === data.workspace.id && EntityIdSchema.safeParse(projectId).success;
  const fileQuery = useQuery({ ...studioQueryOptions(client, 'getFile', { workspaceId: data.workspace.id, fileId: fileId ?? data.workspace.id }), enabled: requested && scopedRoute && !!fileId, staleTime: 0, refetchOnMount: 'always' });
  const parent = useQuery({ ...studioQueryOptions(client, 'getProject', { workspaceId: data.workspace.id, projectId: projectId ?? data.workspace.id }), enabled: requested && scopedRoute, staleTime: 0, refetchOnMount: 'always' });
  const record = fileQuery.data?.data, file = requested && scopedRoute && !!record && record.id === fileId && record.workspaceId === data.workspace.id && record.projectId === projectId && !fileQuery.isError && !parent.isError && !fileQuery.isFetching && !parent.isFetching && parent.data ? record : null;
  const members = useCompleteMembers(data.workspace.id);
  const taskQuery = useQuery({ ...studioQueryOptions(client, 'getTask', { workspaceId: data.workspace.id, taskId: file?.taskId ?? data.workspace.id }), enabled: !!file?.taskId });
  const close = () => { projects.projectSurfaceOpened(); void navigate({ to: location.pathname, search: previous => { const next = { ...previous }; delete next.fileId; return next; }, replace: true }); };
  const copy = (url: string) => { projects.projectSurfaceOpened(); void navigator.clipboard.writeText(url).then(() => projects.notice('Link copied', undefined, { duration: 4200 }), () => projects.notice("Copy isn't available here — " + url, undefined, { kind: 'info', duration: 6000 })); };
  const denied = !scopedRoute || !fileId || fileQuery.isError || parent.isError || !!record && (record.id !== fileId || record.workspaceId !== data.workspace.id || record.projectId !== projectId);
  return <FileIntentContext value={{ deleted: (file, descriptor) => { setToasts(rows => [{ id: crypto.randomUUID(), message: `Deleted ${file.name}`, duration: descriptor ? 5000 : 2200, ...(descriptor ? { action: { label: 'Undo', onAction: () => { void undo(descriptor); } } } : {}) }, ...rows]); }, openFile: file => { projects.projectSurfaceOpened(); if (file.workspaceId === data.workspace.id) { const target = links.project(file.workspaceId, file.projectId, 'files'); void navigate({ to: target, search: previous => ({ ...(location.pathname === target ? previous : {}), fileId: file.id }) }); } }, copyFile: file => copy(new URL(links.file(file.workspaceId, file.projectId, file.id), window.location.origin).href) }}>{children}
    {file && <FilePreviewDialog file={file} entryRevision={`${file.id}/${projects.overlayState}`} now={clock.now()} author={members.data?.items.find(member => member.id === file.createdBy)?.name ?? data.members.find(member => member.id === file.createdBy)?.name ?? 'you'} taskTitle={taskQuery.isError ? 'Open task' : taskQuery.data?.data.task.title ?? 'Open task'} onClose={close} onCopy={copy} onTaskOpen={id => { void navigate({ to: location.pathname, search: previous => { const next = { ...previous }; delete next.fileId; return next; }, replace: true }).then(() => tasks.openTask(id)); }} />}
    {requested && !file && <Dialog open size="sm" aria-label="File preview" onOpenChange={open => { if (!open) close(); }}><DialogBody>{denied ? <Alert tone="danger">This file is unavailable.</Alert> : <div role="status">Loading preview…</div>}{(fileQuery.isError || parent.isError) && <Button onClick={() => { void fileQuery.refetch(); void parent.refetch(); }}>Retry</Button>}<Button onClick={close}>Close</Button></DialogBody></Dialog>}
    {retryUndo && <Alert className="fixed bottom-4 right-4 z-[100]" tone="danger">{commands.error}<Button disabled={commands.pending} onClick={() => { void undo(retryUndo); }}>Retry Undo</Button></Alert>}<ToastViewport items={toasts} onDismiss={id => setToasts(rows => rows.filter(row => row.id !== id))}/>
  </FileIntentContext>;
}
