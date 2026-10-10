import { Badge, ColorDot } from '@studio/ui';
import type { DirectoryMember } from '../../data/people-demo';
export interface MemberStatusProps { status: DirectoryMember['status']; profile?: boolean }
export function MemberStatus({ status, profile = false }: MemberStatusProps) { if (profile && status !== 'invited') return null; return <Badge tone={status === 'invited' ? 'amber' : status === 'deactivated' ? 'neutral' : 'green'}>{!profile && status !== 'deactivated' && <ColorDot color="currentColor"/>}{profile ? 'Invite pending' : status === 'invited' ? 'Invited' : status === 'deactivated' ? 'Deactivated' : 'Active'}</Badge>; }
