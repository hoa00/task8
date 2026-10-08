import { Link, useLocation } from '@tanstack/react-router';
import { AvatarBase, Button, Icon, IconButton, KeyHint } from '@studio/ui';
import type { IconName } from '@studio/ui';
import { useWorkspaceBootstrap, useWorkspaceId } from './workspace-context';
import { links, pageNames } from '../navigation';

export function Breadcrumb() {
  const workspaceId = useWorkspaceId(), data = useWorkspaceBootstrap().data!.data;
  const pathname = useLocation({select:location=>location.pathname});
  const parts=pathname.split('/');
  const project=parts[3]==='projects' && parts[4] ? data.projects.find(item=>item.project.id===parts[4])?.project : undefined;
  const team=parts[3]==='teams' && parts[4] ? data.teams.find(item=>item.id===parts[4]) : undefined;
  const member=parts[3]==='members' && parts[4] ? data.members.find(item=>item.id===parts[4]) : undefined;
  const label=project?.name ?? team?.name ?? member?.name ?? pageNames[parts[3]??parts.at(-1)??''] ?? 'Not found';
  return <nav className="shell-crumbs flex min-w-0 items-center gap-2 truncate text-sm text-secondary" aria-label="Breadcrumb">{(project||team||member) && <><Link to={links.workspace(workspaceId,project?'projects':team?'teams':'members')} className="shell-parent-crumb inline-flex items-center gap-[6px] whitespace-nowrap py-[3px] transition-colors source-hover:text-foreground">{project?'Projects':team?'Teams':'Members'}</Link><span className="shell-crumb-separator text-xs text-faint">/</span></>}<Link to={project?links.project(workspaceId,project.id,'overview'):pathname} className="shell-current-crumb inline-flex items-center gap-[6px] whitespace-nowrap py-[3px] font-medium text-foreground">{project && <span className="grid size-4 place-items-center rounded-xs" style={{background:`color-mix(in srgb, ${project.color} 16%, transparent)`,color:project.color}}><Icon name={project.icon as IconName} size={11}/></span>}{label}</Link></nav>;
}
export interface TopbarProps { onOpenNavigation: () => void; openerRef: React.RefObject<HTMLButtonElement | null> }
export function Topbar({onOpenNavigation,openerRef}:TopbarProps) {
  const workspaceId=useWorkspaceId(),data=useWorkspaceBootstrap().data!.data;
  const member=data.currentMember;
  const initials=member.name.split(' ').map(n=>n[0]).join('').slice(0,2);
  return <header className="shell-topbar relative z-[5] flex h-[var(--topbar-h)] shrink-0 items-center gap-[6px] border-0 border-b border-solid border-border bg-surface pl-[var(--gutter)] pr-3"><IconButton ref={openerRef} className="shell-navigation-opener" aria-label="Open navigation" onClick={onOpenNavigation}><Icon name="menu" size={17}/></IconButton><Breadcrumb/><span className="flex-1"/><Link to={links.workspace(workspaceId,'search')} className="shell-topsearch flex h-control-sm w-[220px] items-center gap-2 rounded-sm border border-solid border-border bg-sunken pl-[9px] pr-[6px] text-sm text-muted transition-[border-color] source-hover:border-border-strong source-hover:text-secondary" aria-label="Search and commands"><Icon name="search" size={14}/><span className="shell-search-label min-w-0 truncate">Search or jump to…</span><KeyHint className="shell-search-key ml-auto shrink-0">{navigator.platform.includes('Mac')?'⌘':'Ctrl'}K</KeyHint></Link><Link to={links.workspace(workspaceId,'notifications')} aria-label="Notifications" className="shell-top-icon relative inline-flex size-control-md shrink-0 items-center justify-center rounded-sm text-secondary source-hover:bg-surface-2 source-hover:text-foreground"><Icon name="bell" size={16}/>{data.unreadCount>0 && <span className="absolute right-[7px] top-[6px] size-[7px] rounded-[50%] bg-accent [box-shadow:0_0_0_2px_var(--surface)]"/>}</Link><Button size="sm" aria-label="Create new" aria-haspopup="menu" aria-disabled="true" className="shell-create"><Icon name="plus" size={14}/><span className="shell-hide-mobile">New</span><Icon name="chevron-down" size={12} className="shell-hide-mobile"/></Button><IconButton aria-label="Account menu" aria-disabled="true" className="shell-hide-mobile w-auto px-[2px]"><AvatarBase label={member.name} initials={initials} color={member.avatarColor} size="md"/></IconButton></header>;
}
