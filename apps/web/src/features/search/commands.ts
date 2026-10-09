import type { IconName } from '@studio/ui';
import type { WorkspacePage } from '../../app/navigation';
export type CommandId = 'task' | 'project' | 'search' | 'home' | 'inbox' | 'my' | 'projects' | 'calendar' | 'timeline' | 'members' | 'settings' | 'appearance' | 'workspace' | 'dark' | 'invite' | 'sidebar' | 'shortcuts' | 'signout' | 'activity' | 'notifications' | 'editTask';
export interface CommandDefinition { id: CommandId; name: string; icon: IconName; keys?: readonly string[]; page?: WorkspacePage; pendingOwner?: number; palette?: boolean }
export const commandDefinitions: readonly CommandDefinition[] = [
 { id: 'task', name: 'Create task', icon: 'plus', keys: ['N'] },
 { id: 'project', name: 'Create project', icon: 'folder-plus', keys: ['P'] },
 { id: 'search', name: 'Search workspace', icon: 'search', keys: ['/'] },
 { id: 'home', name: 'Go to Home', icon: 'house', keys: ['G', 'H'], page: 'home' },
 { id: 'inbox', name: 'Go to Inbox', icon: 'inbox', keys: ['G', 'I'], page: 'inbox' },
 { id: 'my', name: 'Go to My Tasks', icon: 'circle-check', keys: ['G', 'T'], page: 'my-tasks' },
 { id: 'projects', name: 'Go to Projects', icon: 'folder-kanban', keys: ['G', 'P'], page: 'projects' },
 { id: 'calendar', name: 'Go to Calendar', icon: 'calendar', keys: ['G', 'C'], page: 'calendar' },
 { id: 'timeline', name: 'Go to Timeline', icon: 'chart-gantt', page: 'timeline' },
 { id: 'members', name: 'Go to Members', icon: 'users', page: 'members' },
 { id: 'settings', name: 'Open settings', icon: 'settings', keys: ['G', 'S'], pendingOwner: 23 },
 { id: 'appearance', name: 'Appearance settings', icon: 'palette', pendingOwner: 23 },
 { id: 'workspace', name: 'Switch workspace…', icon: 'arrow-left-right' },
 { id: 'dark', name: 'Switch to dark mode', icon: 'moon', keys: ['Mod', '⇧', 'L'] },
 { id: 'invite', name: 'Invite member', icon: 'user-plus' },
 { id: 'sidebar', name: 'Toggle sidebar', icon: 'panel-left', keys: ['['] },
 { id: 'shortcuts', name: 'Keyboard shortcuts', icon: 'keyboard', keys: ['?'] },
 { id: 'signout', name: 'Sign out', icon: 'log-out', pendingOwner: 26 },
 { id: 'activity', name: 'Go to Activity', icon: 'activity', keys: ['G', 'A'], page: 'activity', palette: false },
 { id: 'notifications', name: 'Go to Notifications', icon: 'bell', keys: ['G', 'N'], page: 'notifications', palette: false },
 { id: 'editTask', name: 'Edit task', icon: 'pencil', keys: ['E'], palette: false },
];
export const modLabel = (platform: string) => platform.includes('Mac') ? '⌘' : 'Ctrl';
export const commandKeys = (command: CommandDefinition, platform: string) => command.keys?.map(key => key === 'Mod' ? modLabel(platform) : key);
export interface ShortcutDefinition { name: string; keys: readonly string[]; owner: 'global' | 'overlay' | 'feature' | 'palette' }
export interface ShortcutGroup { name: string; items: readonly ShortcutDefinition[] }
const commandShortcut = (id: CommandId, name?: string): ShortcutDefinition => { const command = commandDefinitions.find(row => row.id === id)!; return { name: name ?? command.name, keys: command.keys ?? [], owner: 'global' }; };
// WU23 imports these definitions; feature-local submit/editor/composer keys are
// documentation only here. Their existing owners continue to register them.
export const shortcutGroups: readonly ShortcutGroup[] = [
 { name: 'General', items: [ { name: 'Command menu', keys: ['Mod', 'K'], owner: 'global' }, commandShortcut('search', 'Search'), commandShortcut('shortcuts'), commandShortcut('sidebar'), { name: 'Toggle dark mode', keys: ['Mod', 'Shift', 'L'], owner: 'global' }, { name: 'Close panel or dialog', keys: ['Esc'], owner: 'overlay' } ] },
 { name: 'Create', items: [commandShortcut('task', 'New task'), commandShortcut('project', 'New project'), { name: 'Submit form', keys: ['Mod', '↵'], owner: 'feature' }, { name: 'Send comment', keys: ['Mod', '↵'], owner: 'feature' }] },
 { name: 'Navigate', items: ['home', 'my', 'projects', 'inbox', 'calendar', 'settings'].map(id => commandShortcut(id as CommandId, id === 'settings' ? 'Go to Settings' : undefined)) },
 { name: 'Command menu', items: [{ name: 'Move selection', keys: ['↑', '↓'], owner: 'palette' }, { name: 'Run command', keys: ['↵'], owner: 'palette' }, { name: 'Search mode', keys: ['Tab'], owner: 'palette' }] },
];
