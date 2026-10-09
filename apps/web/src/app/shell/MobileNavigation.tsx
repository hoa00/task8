import { Link, useLocation } from '@tanstack/react-router';
import { Icon } from '@studio/ui';
import type { IconName } from '@studio/ui';
import { useWorkspaceBootstrap,useWorkspaceId } from './workspace-context';
import { links } from '../navigation';
export function MobileNavigation({onOpenNavigation}:{onOpenNavigation:()=>void}) {
 const workspaceId=useWorkspaceId(),pathname=useLocation({select:location=>location.pathname});
 const inbox=useWorkspaceBootstrap().data!.data.navigationCounts.inbox;
 return <nav aria-label="Primary" className="shell-bottomnav fixed inset-x-0 bottom-0 z-[45] border-0 border-t border-solid border-border bg-surface px-[6px] pt-1">{([['home','Home','house'],['my-tasks','My Tasks','circle-check'],['projects','Projects','folder-kanban'],['inbox','Inbox','inbox']] as const).map(([page,label,icon])=><Link key={page} activeOptions={{ exact: page === 'projects' }} to={links.workspace(workspaceId,page)} aria-current={pathname===links.workspace(workspaceId,page)?'page':undefined} className="shell-bottomitem relative flex min-h-12 flex-1 flex-col items-center gap-[2px] rounded-sm py-[5px] text-[11px] text-muted"><Icon name={icon as IconName} size={19}/><span>{label}</span>{page==='inbox' && inbox>0 && <span className="absolute left-[calc(50%+6px)] top-[3px] size-[7px] rounded-[50%] bg-accent"/>}</Link>)}<button className="shell-bottomitem relative flex min-h-12 flex-1 flex-col items-center gap-[2px] rounded-sm py-[5px] text-[11px] text-muted" onClick={onOpenNavigation}><Icon name="ellipsis" size={19}/><span>More</span></button></nav>;
}
