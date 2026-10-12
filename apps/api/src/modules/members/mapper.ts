import type { MemberDto, UserProfileDto } from '@studio/contracts/api';
import { MemberSchema, UserProfileSchema } from '@studio/contracts/api';
import { nullableInstant } from '../../shared/clock.ts';
export interface ProfileDtoInput {
  id: string;
  name: string;
  displayEmail: string;
  title: string;
  avatarColor: string;
  timezone: string;
  version: number;
}
export function profileDto(u: ProfileDtoInput): UserProfileDto {
  return UserProfileSchema.parse({
    id: u.id,
    name: u.name,
    email: u.displayEmail,
    title: u.title,
    avatarColor: u.avatarColor,
    timezone: u.timezone,
    version: u.version,
  });
}
export interface MemberDtoInput {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  email: string;
  title: string;
  avatarColor: string;
  timezone: string;
  role: string;
  status: string;
  teamId: string | null;
  lastSeenAt: number | null;
  version: number;
}
export function memberDto(m: MemberDtoInput): MemberDto {
  return MemberSchema.parse({ ...m, lastSeenAt: nullableInstant(m.lastSeenAt) });
}
