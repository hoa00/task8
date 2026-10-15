import type { MemberDto } from '@studio/contracts/api';
export interface DirectoryMember extends Omit<MemberDto, 'status'> {
  status: 'active' | 'invited' | 'deactivated';
  demo: boolean;
}
