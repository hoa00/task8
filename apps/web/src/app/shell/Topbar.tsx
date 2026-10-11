import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useRef, useState } from 'react';
import { ProfileMenu } from './ProfileMenu';
import { useWorkspaceIntents } from './transient-context';
import { useProjectIntents } from '../../features/projects/project-intents';
import { usePeopleIntents } from '../../features/people/people-intents';
import { useTeamIntents } from '../../features/teams/team-intents';
import { useSearchIntents } from '../../features/search/search-intents';
import { Link, useLocation } from '@tanstack/react-router';
import { AvatarBase, Button, Icon, IconButton, KeyHint, Menu, MenuGroup, MenuItem, MenuSeparator } from '@studio/ui';
import type { IconName } from '@studio/ui';
import { useWorkspaceBootstrap, useWorkspaceId } from './workspace-context';
import { links, pageNames } from '../navigation';

export function Breadcrumb() { useTranslation();
  const workspaceId = useWorkspaceId(), data = useWorkspaceBootstrap().data!.data;
  const pathname = useLocation({select:location=>location.pathname});
  const parts=pathname.split('/');
  const project=parts[3]==='projects' && parts[4] ? data.projects.find(item=>item.project.id===parts[4])?.project : undefined;
  const team=parts[3]==='teams' && parts[4] ? data.teams.find(item=>item.id===parts[4]) : undefined;
  const member=parts[3]==='members' && parts[4] ? data.members.find(item=>item.id===parts[4]) : undefined;
  const label=project?.name ?? team?.name ?? member?.name ?? pageNames[parts[3]??parts.at(-1)??''] ?? 'Not found';
  return <nav className="shell-crumbs flex min-w-0 items-center gap-2 truncate text-sm text-secondary" aria-label={t("Breadcrumb")}>{(project||team||member) && <><Link to={links.workspace(workspaceId,project?'projects':team?'teams':'members')} className="shell-parent-crumb inline-flex items-center gap-[6px] whitespace-nowrap py-[3px] transition-colors source-hover:text-foreground">{project?t("Projects"):team?t("Teams"):t("Members")}</Link><span className="shell-crumb-separator text-xs text-faint">/</span></>}<Link to={project?links.project(workspaceId,project.id,'overview'):pathname} className="shell-current-crumb inline-flex items-center gap-[6px] whitespace-nowrap py-[3px] font-medium text-foreground">{project && <span className="grid size-4 place-items-center rounded-xs" style={{color:project.color}}><Icon name={project.icon as IconName} size={11}/></span>}{t(label)}</Link></nav>;
}
export interface TopbarProps { onOpenNavigation: () => void; openerRef: React.RefObject<HTMLButtonElement | null> }
export function Topbar({onOpenNavigation,openerRef}:TopbarProps) { useTranslation();
  const workspaceId=useWorkspaceId(),data=useWorkspaceBootstrap().data!.data;
  const member=data.currentMember,search=useSearchIntents(), tasks=useWorkspaceIntents(),projects=useProjectIntents(),people=usePeopleIntents(),teams=useTeamIntents();
  const createAnchor=useRef<HTMLButtonElement>(null),profileAnchor=useRef<HTMLButtonElement>(null),[create,setCreate]=useState(false),[profile,setProfile]=useState(false);
  const initials=member.name.split(' ').map(n=>n[0]).join('').slice(0,2);
  return <header className="shell-topbar relative z-[5] flex h-[var(--topbar-h)] shrink-0 items-center gap-[6px] border-0 border-b border-solid border-border bg-surface pl-[var(--gutter)] pr-3"><IconButton ref={openerRef} className="shell-navigation-opener" aria-label={t("Open navigation")} onClick={onOpenNavigation}><Icon name="menu" size={17}/></IconButton><Breadcrumb/><span className="flex-1"/><button type="button" onClick={() => search.openPalette()} className="shell-topsearch flex h-control-sm w-[220px] items-center gap-2 rounded-sm border border-solid border-border bg-sunken pl-[9px] pr-[6px] text-sm text-muted transition-[border-color] source-hover:border-border-strong source-hover:text-secondary" aria-label={t("Search and commands")}><Icon name="search" size={14}/><span className="shell-search-label min-w-0 truncate">{t("Search or jump to…")}</span><KeyHint className="shell-search-key ml-auto shrink-0">{navigator.platform.includes('Mac')?'⌘':t("Ctrl")}{t("K")}</KeyHint></button><Link to={links.workspace(workspaceId,'notifications')} aria-label={t("Notifications")} className="shell-top-icon relative inline-flex size-control-md shrink-0 items-center justify-center rounded-sm text-secondary source-hover:bg-surface-2 source-hover:text-foreground"><Icon name="bell" size={16}/>{data.unreadCount>0 && <span className="absolute right-[7px] top-[6px] size-[7px] rounded-[50%] bg-accent [box-shadow:0_0_0_2px_var(--surface)]"/>}</Link><Button ref={createAnchor} size="sm" aria-label={t("Create new")} aria-haspopup="menu" aria-expanded={create} onClick={()=>setCreate(value=>!value)} className="shell-create"><Icon name="plus" size={14}/><span className="shell-hide-mobile">{t("New")}</span><Icon name="chevron-down" size={12} className="shell-hide-mobile"/></Button><IconButton ref={profileAnchor} aria-label={t("Account menu")} aria-haspopup="menu" aria-expanded={profile} onClick={()=>setProfile(value=>!value)} className="shell-hide-mobile w-auto px-[2px]"><AvatarBase label={member.name} initials={initials} color={member.avatarColor} size="md"/></IconButton><ProfileMenu open={profile} onOpenChange={setProfile} anchor={profileAnchor}/><Menu open={create} onOpenChange={setCreate} anchor={createAnchor} label={t("Create")} style={{width:220}}><MenuGroup label={t("Create")}/><MenuItem icon={<Icon name="circle-check" size={15}/>} shortcut={<KeyHint>{t("N")}</KeyHint>} onSelect={()=>{setCreate(false);tasks.openTaskForm();}}>{t("Task")}</MenuItem><MenuItem icon={<Icon name="folder-plus" size={15}/>} shortcut={<KeyHint>{t("P")}</KeyHint>} onSelect={()=>{setCreate(false);projects.newProject();}}>{t("Project")}</MenuItem><MenuItem icon={<Icon name="users" size={15}/>} onSelect={()=>{setCreate(false);teams.newTeam();}}>{t("Team")}</MenuItem><MenuSeparator/><MenuItem icon={<Icon name="user-plus" size={15}/>} onSelect={()=>{setCreate(false);people.invite();}}>{t("Invite member")}</MenuItem></Menu></header>;
}
