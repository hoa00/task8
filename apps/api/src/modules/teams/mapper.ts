import { TeamSchema } from '@studio/contracts/api';
import { instant } from '../../shared/clock.ts';
export interface TeamDtoInput {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  version: number;
}
export function teamDto(
  t: TeamDtoInput & { deletedAt?: number | null; deletedBy?: string | null },
  memberRows: readonly { id: string; teamId: string | null }[],
) {
  return TeamSchema.parse({
    id: t.id,
    workspaceId: t.workspaceId,
    name: t.name,
    description: t.description,
    icon: t.icon,
    color: t.color,
    memberIds: memberRows.filter((m) => m.teamId === t.id).map((m) => m.id),
    createdAt: instant(t.createdAt),
    updatedAt: instant(t.updatedAt),
    version: t.version,
  });
}
