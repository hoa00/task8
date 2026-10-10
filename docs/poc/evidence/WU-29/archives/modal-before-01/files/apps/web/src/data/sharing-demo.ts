import type { MemberDto, ProjectDto } from '@studio/contracts/api';
export const sharingPermissions = ['Can view', 'Can comment', 'Can edit', 'Full access'] as const;
export type SharingPermission = typeof sharingPermissions[number];
export interface DemoGuest { id: MemberDto['id']; name: string; email: string; avatarColor: string }
export interface SharingDemoState { visibility: 'workspace' | 'private'; memberIds: string[]; permissions: Record<string, SharingPermission>; guests: DemoGuest[]; version: number }
export interface SharingDemoAdapter {
  read(project: ProjectDto, members: readonly MemberDto[], principalId: string): SharingDemoState;
  write(project: ProjectDto, principalId: string, expectedVersion: number, next: Omit<SharingDemoState, 'version'>): SharingDemoState;
  guest(email: string): DemoGuest;
}
