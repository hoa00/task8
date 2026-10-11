import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, MouseEventHandler } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TaskQuerySchema, projectStatuses } from '@studio/contracts/api';
import type { BootstrapDto, SearchResultDto, WorkspaceDto } from '@studio/contracts/api';
import { Alert, Badge, BrandMark, ColorDot, Dialog, EmptyState, Icon, KeyHint, Logo } from '@studio/ui';
import type { IconName } from '@studio/ui';
import { useDataRuntime } from '../../data/context';
import { queryKeys } from '../../data/query-keys';
import { useTheme } from '../../theme/theme-context';
import { loadTaskViewDataset } from '../tasks/loadTaskViewDataset';
import { TaskStatusIcon } from '../tasks/atoms';
import { MemberIdentity } from '../people/MemberIdentity';
import { commandDefinitions, commandKeys } from './commands';
import type { CommandId, CommandDefinition } from './commands';
import { searchCategories, searchLabel, searchResultId, useWorkspaceSearch } from './search-query';
import type { SearchCategory } from './search-query';
import { Highlight } from './Highlight';
export type PaletteMode = 'cmd' | 'search' | 'ws';
type PaletteAction = { kind: 'command'; command: CommandId } | { kind: 'result'; result: SearchResultDto } | { kind: 'recent'; query: string } | { kind: 'all' } | { kind: 'workspace'; workspaceId: string } | { kind: 'suggestion'; suggestion: 'overdue' | 'mine' | 'high' | 'files' };
interface PaletteItem { id: string; name: string; leading: ReactNode; sub?: string | undefined; right?: string; keys?: readonly string[] | undefined; action: PaletteAction; disabled?: boolean }
interface PaletteGroup { name: string; items: PaletteItem[] }
export interface CommandPaletteProps { mode: PaletteMode; data: BootstrapDto; workspaces: readonly WorkspaceDto[]; recent: readonly string[]; onClose: () => void; onCommand: (id: CommandId) => void; onResult: (result: SearchResultDto) => void; onViewAll: (query: string, category: SearchCategory) => void; onSwitchWorkspace: (workspaceId: string) => void; onSuggestion: (kind: 'overdue' | 'mine' | 'high' | 'files') => void }
const scopeIcons: Record<SearchCategory, IconName> = { all: 'layers', tasks: 'circle-check', projects: 'folder', people: 'users', files: 'paperclip', comments: 'message-square' };
export function CommandPalette({ mode: initialMode, data, workspaces, recent, onClose, onCommand, onResult, onViewAll, onSwitchWorkspace, onSuggestion }: CommandPaletteProps) { useTranslation();
 const [mode, setMode] = useState<PaletteMode>(initialMode), [q, setQ] = useState(''), [scope, setScope] = useState<SearchCategory>('all'), [selected, setSelected] = useState(0), input = useRef<HTMLInputElement>(null), { client } = useDataRuntime(), { effectiveDark } = useTheme();
 const search = useWorkspaceSearch(data.workspace.id, q, mode === 'search' ? scope : 'all', mode !== 'ws');
 const recentTasks = useQuery({ queryKey: [...queryKeys.workspace(data.workspace.id), 'tasks', 'palette-recent'], queryFn: ({ signal }) => loadTaskViewDataset(client, data.workspace.id, TaskQuerySchema.parse({}), signal), enabled: mode === 'cmd' && !q.trim() });
 const commands = commandDefinitions.filter(row => row.palette !== false).map(row => row.id === 'dark' && effectiveDark ? { ...row, name: t("Switch to light mode"), icon: 'sun' as const } : row).filter(row => !q.trim() || (t(row.name).toLowerCase().includes(q.trim().toLowerCase()) || row.name.toLowerCase().includes(q.trim().toLowerCase())));
 const commandItem = (row: CommandDefinition): PaletteItem => ({ id: `command:${row.id}`, name: t(row.name), leading: <Icon name={row.icon} size={15}/>, keys: commandKeys(row, navigator.platform), action: { kind: 'command', command: row.id } });
 const resultItem = (row: SearchResultDto): PaletteItem => {
  const id = `${row.kind}:${searchResultId(row)}`, action: PaletteAction = { kind: 'result', result: row };
  if (row.kind === 'tasks') return { id, action, leading: <TaskStatusIcon status={row.task.status}/>, name: row.task.title, sub: data.projects.find(item => item.project.id === row.task.projectId)?.project.name, right: row.task.key };
  if (row.kind === 'projects') return { id, action, leading: <ColorDot color={row.project.project.color} className="size-2! rounded-[3px]!"/>, name: row.project.project.name, sub: t(projectStatuses.find(status => status.id === row.project.project.status)!.name) };
  if (row.kind === 'people') return { id, action, leading: <MemberIdentity member={row.member} avatarOnly/>, name: row.member.name, sub: row.member.title };
  if (row.kind === 'files') { const icons: Record<string, IconName> = { fig: 'pen-tool', pdf: 'file-text', zip: 'folder-archive', img: 'image', sheet: 'file-spreadsheet', doc: 'file-text', code: 'file-code' }; return { id, action, leading: <Icon name={icons[row.file.fileType] ?? 'file'} size={15}/>, name: row.file.name, sub: data.projects.find(item => item.project.id === row.file.projectId)?.project.name, right: row.file.displaySize }; }
  return { id, action, leading: <MemberIdentity member={data.members.find(member => member.id === row.comment.authorId) ?? null} avatarOnly/>, name: row.comment.bodyText, sub: t('on {{name}}', { name: row.taskTitle }) };
 };
 const groups: PaletteGroup[] = [];
 if (mode === 'ws') groups.push({ name: t("Switch workspace"), items: workspaces.filter(row => !q || row.name.toLowerCase().includes(q.trim().toLowerCase())).map(row => ({ id: row.id, name: row.name, sub: row.planLabel ? t(row.planLabel) : undefined, leading: <span className={`grid size-5 shrink-0 place-items-center text-[9px] font-semibold text-[#fff] ${row.brand ? 'overflow-hidden rounded-[28%] bg-[#000]' : 'rounded-[6px]'}`} style={row.brand ? undefined : { background: row.iconColor }}>{row.brand ? <BrandMark size={20}/> : row.name[0]}</span>, action: { kind: 'workspace', workspaceId: row.id } })) });
 else if (mode === 'cmd' && !q.trim()) {
  groups.push({ name: 'Suggestions', items: commands.slice(0, 3).concat(commands.filter(row => row.id === 'dark' || row.id === 'workspace')).map(commandItem) });
  groups.push({ name: t("Recent tasks"), items: [...(recentTasks.data?.items ?? [])].filter(task => task.assigneeId === data.currentMember.id || task.isFavorite).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4).map(task => resultItem({ kind: 'tasks', task })) });
  groups.push({ name: 'Navigation', items: commands.filter(row => row.page).map(commandItem) });
 } else if (mode === 'search' && !q.trim()) {
  groups.push({ name: t("Recent searches"), items: recent.map(query => ({ id: `recent:${query}`, name: query, leading: <Icon name="history" size={15}/>, action: { kind: 'recent', query } })) });
  groups.push({ name: 'Suggested', items: [ ['overdue', 'Overdue tasks', 'clock-alert'], ['mine', 'Tasks assigned to me', 'user'], ['high', 'High priority in Website Redesign', 'signal-high'], ['files', 'Files in Website Redesign', 'paperclip'] ].map(([suggestion, name, icon]) => ({ id: `suggested:${suggestion}`, name: name!, leading: <Icon name={icon as IconName} size={15}/>, action: { kind: 'suggestion', suggestion: suggestion as 'overdue' | 'mine' | 'high' | 'files' } })) });
 } else if (q.trim()) {
  if (mode === 'cmd' && commands.length) groups.push({ name: 'Commands', items: commands.slice(0, 5).map(commandItem) });
  const limit = mode === 'search' && scope !== 'all' ? 12 : 4;
  for (const category of searchCategories) if (category !== 'all' && (mode !== 'search' || scope === 'all' || scope === category)) { const rows = search.data?.items.filter(row => row.kind === category) ?? []; if (rows.length) groups.push({ name: searchLabel(category), items: rows.slice(0, limit).map(resultItem) }); }
  groups.push({ name: '', items: [{ id: 'view-all', name: t("View all results for “{{value1}}”", { value1: String(q.trim()) }), leading: <Icon name="search" size={15}/>, action: { kind: 'all' } }] });
 }
 const nonempty = groups.filter(group => group.items.length), flat = nonempty.flatMap(group => group.items), index = Math.min(selected, Math.max(0, flat.length - 1));
 useEffect(() => { document.getElementById(`pi-${index}`)?.scrollIntoView({ block: 'nearest' }); }, [index]);
 const handleRunItem = (item: PaletteItem | undefined) => {
  if (!item || item.disabled) return;
  const action = item.action;
  if (action.kind === 'recent') { setQ(action.query); setSelected(0); input.current?.focus(); }
  else if (action.kind === 'command' && (action.command === 'search' || action.command === 'workspace')) { setMode(action.command === 'search' ? 'search' : 'ws'); setQ(''); setScope('all'); setSelected(0); input.current?.focus(); }
  else { onClose(); if (action.kind === 'command') onCommand(action.command); else if (action.kind === 'result') onResult(action.result); else if (action.kind === 'all') onViewAll(q.trim(), mode === 'search' ? scope : 'all'); else if (action.kind === 'workspace') onSwitchWorkspace(action.workspaceId); else onSuggestion(action.suggestion); }
 };
 const onItemClick: MouseEventHandler<HTMLDivElement> = event => handleRunItem(flat[Number(event.currentTarget.id.slice(3))]);
 let itemIndex = 0;
 return <Dialog open mode="palette" initialFocus={input} onOpenChange={open => { if (!open) onClose(); }} aria-label={t("Command menu")} data-command-palette data-palette-mode={mode} data-palette-ready={(!q.trim() && (mode !== 'cmd' || recentTasks.data) || search.data) ? '' : undefined} onKeyDown={event => {
  if (event.defaultPrevented || event.nativeEvent.isComposing) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelected((index + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(flat.length, 1)) % Math.max(flat.length, 1)); }
  else if (event.key === 'Enter') { event.preventDefault(); handleRunItem(flat[index]); }
  else if (event.key === 'Tab') { event.preventDefault(); setMode(mode === 'cmd' ? 'search' : 'cmd'); setSelected(0); input.current?.focus(); }
  else if (event.key === 'Backspace' && !q && mode !== 'cmd') { event.preventDefault(); setMode('cmd'); setSelected(0); }
 }}>
 <div className="flex h-[50px] items-center gap-[10px] border-0 border-b border-solid border-border px-[14px]"><Icon name={mode === 'search' ? 'search' : 'command'} size={17}/>{mode !== 'cmd' && <Badge className="shrink-0">{mode === 'search' ? t("Search") : t("Workspace")}</Badge>}<input ref={input} id="pal-in" className="h-full flex-1 border-0 bg-transparent text-md outline-none" value={q} maxLength={500} onChange={event => { setQ(event.target.value); setSelected(0); }} autoComplete="off" placeholder={mode === 'search' ? t("Search tasks, projects, people, files, comments…") : mode === 'ws' ? t("Find a workspace…") : t("Type a command or search…")} role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={flat.length ? `pi-${index}` : undefined}/><KeyHint>{t("Esc")}</KeyHint></div>
 {mode === 'search' && <div className="flex flex-wrap gap-1 border-0 border-b border-solid border-divider px-3 py-2" role="tablist" aria-label={t("Search scope")}>{searchCategories.map(category => <button key={category} role="tab" aria-selected={scope === category} className={`inline-flex h-6 items-center gap-[5px] rounded-[12px] border border-solid px-[9px] text-xs ${scope === category ? 'border-foreground bg-foreground text-[var(--text-inv)]' : "border-border text-secondary"}`} onClick={() => { setScope(category); setSelected(0); input.current?.focus(); }}><Icon name={scopeIcons[category]} size={12}/>{searchLabel(category)}</button>)}</div>}
 <div id="pal-list" role="listbox" className="flex-1 overflow-y-auto p-[6px]" aria-label={t("Commands and results")}>{search.error ? <Alert tone="danger">{search.error.message}<button onClick={() => { void search.retrySearch(); }}>{t("Try again")}</button></Alert> : nonempty.length ? nonempty.map(group => <div key={group.name} className="mb-[2px] border-0 border-b border-solid border-divider pb-1 last:border-b-0">{group.name && <div className="px-[10px] pb-1 pt-[10px] text-2xs font-semibold uppercase tracking-[.06em] text-muted">{t(group.name)}</div>}{group.items.map(item => { const i = itemIndex++; return <div key={item.id} id={`pi-${i}`} role="option" aria-selected={i === index} aria-disabled={item.disabled || undefined} data-palette-item={item.id} onPointerMove={() => setSelected(i)} onClick={onItemClick} className={`flex h-[38px] w-full cursor-pointer items-center gap-[10px] rounded-sm px-[10px] text-left text-body [&>svg]:text-secondary ${i === index ? 'bg-surface-2' : ''}`}>{item.leading}<span className="truncate"><Highlight text={item.action.kind === 'suggestion' ? t(item.name) : item.name} query={q} variant="palette"/></span>{item.sub && <span className="hidden ml-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted">{item.sub}</span>}<span className="ml-auto flex items-center gap-1 text-xs text-muted">{item.right && <span className="font-mono text-[.92em] tracking-[-.01em]">{item.right}</span>}{item.keys?.map((key, n) => <KeyHint key={`${n}/${key}`}>{key}</KeyHint>)}</span></div>; })}</div>) : <EmptyState size="sm" icon="search-x" heading={t("No results found")} description={t("Try a different keyword, or press Tab to search everything.")}/>}</div>
 <div className="flex gap-[14px] border-0 border-t border-solid border-border bg-sunken px-[14px] py-2 text-xs text-muted [&>span]:inline-flex [&>span]:items-center [&>span]:gap-[5px]"><span><KeyHint>↑</KeyHint><KeyHint>↓</KeyHint>{t("navigate")}</span><span><KeyHint>↵</KeyHint>{t("select")}</span><span><KeyHint>{mode === 'cmd' ? t("Tab") : '⌫'}</KeyHint>{mode === 'cmd' ? t("search mode") : t("back to commands")}</span><span className="flex-1"/><span><Logo height={12}/></span></div>
 </Dialog>;
}
