import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Dialog, DialogBody } from '@studio/ui';
import type { BootstrapDto, SearchResultDto } from '@studio/contracts/api';
import { links, validateRouteSearch } from '../../app/navigation';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useDataRuntime } from '../../data/context';
import { studioQueryOptions, useStudioQuery } from '../../data/queries';
import { useTheme } from '../../theme/theme-context';
import { useProjectIntents } from '../projects/project-intents';
import { FilePreviewDialog } from '../files/FileFoundation';
import { normalizeTaskView } from '@studio/domain';
import { SearchIntentContext } from './search-intents';
import { recentSearchKey, readRecentSearches } from './recent-searches';
import { commandDefinitions } from './commands';
import type { CommandId } from './commands';
import { useGlobalShortcuts } from './global-shortcuts';
import { CommandPalette } from './CommandPalette';
import type { PaletteMode, CommandPaletteProps } from './CommandPalette';
import { ShortcutsDialog } from './ShortcutsDialog';
export interface SearchOverlayHostProps { data: BootstrapDto; children: ReactNode; toggleSidebar: () => void; onOpenOverlay: () => void }
export function SearchOverlayHost({ data, children, toggleSidebar, onOpenOverlay }: SearchOverlayHostProps) {
 const { client, clock } = useDataRuntime(), projects = useProjectIntents(), tasks = useWorkspaceIntents(), navigate = useNavigate(), location = useLocation(), theme = useTheme(), catalog = useStudioQuery('listWorkspaces', {}).data?.data ?? [];
 const [palette, setPalette] = useState<{ mode: PaletteMode; generation: number } | null>(null), [shortcuts, setShortcuts] = useState(false), [fileId, setFileId] = useState<string | null>(null), [notice, setNotice] = useState(''), generation = useRef(0);
 const historyKey = recentSearchKey(data.workspace.id, data.currentMember.id), [history, setHistory] = useState(() => ({ key: historyKey, rows: readRecentSearches(historyKey) }));
 const rows = history.key === historyKey ? history.rows : readRecentSearches(historyKey);
 const remember = (q: string) => { const text = q.trim(); if (!text || rows.includes(text)) return; const next = [text, ...rows].slice(0, 5); try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* Optional personal UI history. */ } setHistory({ key: historyKey, rows: next }); };
 const fileQuery = useQuery({ ...studioQueryOptions(client, 'getFile', { workspaceId: data.workspace.id, fileId: fileId ?? data.workspace.id }), enabled: !!fileId });
 const file = fileId ? fileQuery.data?.data : undefined;
 const taskQuery = useQuery({ ...studioQueryOptions(client, 'getTask', { workspaceId: data.workspace.id, taskId: file?.taskId ?? data.workspace.id }), enabled: !!file?.taskId });
 const prepare = () => { onOpenOverlay(); projects.projectSurfaceOpened(); };
 const openPalette = (mode: PaletteMode = 'cmd') => { prepare(); setPalette({ mode, generation: ++generation.current }); };
 const openShortcuts = () => { prepare(); setShortcuts(true); };
 const openResult = (result: SearchResultDto) => { prepare(); if (result.kind === 'tasks') tasks.openTask(result.task.id); else if (result.kind === 'projects') { void navigate({ to: links.project(data.workspace.id, result.project.project.id, data.preferences.defaultTab) }); } else if (result.kind === 'people') { void navigate({ to: `/w/${data.workspace.id}/members/${result.member.id}` }); } else if (result.kind === 'files') setFileId(result.file.id); else tasks.openTask(result.comment.taskId); };
 const run = (id: CommandId) => {
  const command = commandDefinitions.find(row => row.id === id)!;
  if (command.page) { void navigate({ to: links.workspace(data.workspace.id, command.page) }); return; }
  if (id === 'task') { prepare(); tasks.openTaskForm(); } else if (id === 'project') projects.newProject(); else if (id === 'search') openPalette('search'); else if (id === 'workspace') openPalette('ws'); else if (id === 'dark') { setPalette(null); theme.setPreferences({ theme: theme.effectiveDark ? 'light' : 'dark' }); projects.notice(theme.effectiveDark ? 'Light mode on' : 'Dark mode on', undefined, { kind: 'info', duration: 1800 }); } else if (id === 'sidebar') toggleSidebar(); else if (id === 'shortcuts') openShortcuts(); else if (id === 'settings' || id === 'appearance') { void navigate({ to: links.settings(data.workspace.id, id === 'settings' ? 'workspace' : 'appearance') }); } else if (id === 'editTask') { const taskId = validateRouteSearch(location.search).taskId; if (taskId) { prepare(); tasks.openTaskForm(taskId); } } else setNotice(id === 'invite' ? 'Invitations are not available yet.' : 'Sign out is not available yet.');
 };
 useGlobalShortcuts({ run, togglePalette: () => palette ? setPalette(null) : openPalette(), blocked: () => !!document.querySelector('[role="dialog"][aria-modal="true"]:not([data-task-drawer]),[role="menu"],[data-mobile-open=true]') });
 const viewAll = (q: string, category: Parameters<CommandPaletteProps['onViewAll']>[1]) => { remember(q); void navigate({ to: links.workspace(data.workspace.id, 'search'), search: { q, category } }); };
 return <SearchIntentContext value={{ openPalette, openShortcuts, openResult, recent: { rows, remember } }}>{children}
 {palette && <CommandPalette key={palette.generation} mode={palette.mode} data={data} workspaces={catalog} recent={rows} onClose={() => setPalette(null)} onCommand={run} onResult={openResult} onViewAll={viewAll} onSwitchWorkspace={workspaceId => { if (workspaceId !== data.workspace.id) { void navigate({ to: links.workspace(workspaceId, 'home') }); } }} onSuggestion={kind => { if (kind === 'mine') run('my'); else if (kind === 'overdue') { void navigate({ to: links.workspace(data.workspace.id, 'tasks'), search: { view: JSON.stringify(normalizeTaskView({ query: { filters: [{ field: 'due', op: 'is', values: ['overdue'] }] } })) } }); } else { const available = data.projects.find(row => row.access === 'allowed' && row.project.name === 'Website Redesign'); if (!available) { setNotice('This project is unavailable.'); return; } if (kind === 'high') { void client.execute('listSavedViews', { workspaceId: data.workspace.id, projectId: available.project.id }).then(result => { const view = result.data.find(row => row.name === 'High priority'); if (view) void navigate({ to: links.savedView(data.workspace.id, available.project.id, view.id) }); else setNotice('This saved view is unavailable.'); }, () => setNotice('This saved view is unavailable.')); } else { void navigate({ to: links.project(data.workspace.id, available.project.id, 'files') }); } } }}/>}<ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)}/>
 {file && <FilePreviewDialog entryRevision={`${file.id}/${projects.overlayState}`} file={file} now={clock.now()} author={data.members.find(member => member.id === file.createdBy)?.name ?? 'you'} taskTitle={taskQuery.data?.data.task.title ?? 'Open task'} onClose={() => setFileId(null)} onTaskOpen={tasks.openTask} onCopy={url => { projects.projectSurfaceOpened(); void navigator.clipboard.writeText(url).then(() => projects.notice('Link copied'), () => projects.notice('The link could not be copied.')); }}/>} {fileId && !file && <Dialog open size="sm" aria-label="File preview" onOpenChange={open => { if (!open) setFileId(null); }}><DialogBody>{fileQuery.error ? <Alert tone="danger">This file is unavailable.</Alert> : <div role="status">Loading preview…</div>}</DialogBody></Dialog>}
 {notice && <Dialog open size="sm" aria-label="Unavailable" onOpenChange={open => { if (!open) setNotice(''); }}><DialogBody>{notice}</DialogBody></Dialog>}
 </SearchIntentContext>;
}
