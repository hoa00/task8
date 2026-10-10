import { AvatarBase, Icon, IconButton } from '@studio/ui';
import type { BootstrapDto, NotificationDto, TaskDto } from '@studio/contracts/api';
import { MemberIdentity } from '../people/MemberIdentity';
import { CommentText } from '../comments/Comments';

export interface NotificationPresentationProps { notification: NotificationDto; data: BootstrapDto; task?: TaskDto | undefined }
export function NotificationAvatar({ notification, data }: NotificationPresentationProps) {
  if (notification.actorId) return <MemberIdentity member={data.members.find(row => row.id === notification.actorId) ?? null} avatarOnly size="md" className="static!"/>;
  return <AvatarBase label="System notification" size="md" color={notification.projectId && !notification.taskId ? 'var(--red)' : 'var(--amber)'} className="static!"><Icon name={notification.type === 'update' && notification.projectId && !notification.taskId ? 'triangle-alert' : 'clock'} size={13}/></AvatarBase>;
}
export function NotificationContent({ notification, data, task }: NotificationPresentationProps) {
  if (!notification.actorId) return task ? <><b className="font-semibold">{task.title}</b>{' '}<span className="text-secondary">{notification.text}</span></> : <b className="font-semibold">{notification.text}</b>;
  return <><b className="font-semibold">{data.members.find(row => row.id === notification.actorId)?.name ?? 'Unknown member'}</b>{' '}<span className="text-secondary">{notification.text}</span>{' '}{task && <b className="font-medium">{task.title}</b>}</>;
}
export function NotificationSnippet({ notification, data }: NotificationPresentationProps) { return <CommentText text={notification.snippet} members={data.members}/>; }
export interface ReadToggleProps { notification: NotificationDto; layout: 'inbox' | 'notifications'; pending: boolean; onToggle: () => void }
export function ReadToggle({ notification, layout, pending, onToggle }: ReadToggleProps) {
  const label = notification.readAt ? 'Mark as unread' : 'Mark as read';
  return <IconButton size={layout === 'inbox' ? 'xs' : 'sm'} aria-label={label} title={label} disabled={pending} onClick={event => { event.stopPropagation(); onToggle(); }}><Icon name={notification.readAt ? 'mail' : layout === 'inbox' ? 'mail-open' : 'check'} size={layout === 'inbox' ? 13 : 14}/></IconButton>;
}
