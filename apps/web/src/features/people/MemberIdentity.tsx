import { AvatarBase } from '@studio/ui';
import type { AvatarBaseProps } from '@studio/ui';
import type { MemberDisplayDto } from '@studio/contracts/api';
export interface MemberIdentityProps { member: MemberDisplayDto | null; avatarOnly?: boolean; size?: AvatarBaseProps['size']; suffix?: string }
export function MemberIdentity({ member, avatarOnly = false, size = 'sm', suffix = '' }: MemberIdentityProps) {
  const name = member?.name ?? 'Unassigned';
  return <><AvatarBase label={name} initials={member?.name.split(' ').map(value => value[0]).join('').slice(0, 2) ?? ''} color={member?.avatarColor ?? 'var(--gray)'} size={size} empty={!member} />{!avatarOnly && <span className="truncate">{name}{suffix}</span>}</>;
}
