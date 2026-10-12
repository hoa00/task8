import { EntityIdSchema, ProjectSchema, RestrictedProjectSchema } from '@studio/contracts/api';
import { instant, nullableInstant } from '../../shared/clock.ts';
import { ApiFailure } from '../../shared/errors.ts';
import type { ProjectGrant } from './domain/policy.ts';
export interface GrantProjection {
  memberId: string;
  permission: string;
}
export function grantProjection(row: GrantProjection): ProjectGrant {
  if (row.permission !== 'view' && row.permission !== 'edit')
    throw new ApiFailure('INTERNAL_ERROR', 'Invalid project grant projection');
  return { memberId: EntityIdSchema.parse(row.memberId), permission: row.permission };
}

export interface ProjectDtoInput {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: string;
  teamId: string | null;
  leadId: string;
  startDate: string | null;
  dueDate: string | null;
  visibility: string;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number;
  version: number;
}
export interface MilestoneDtoInput {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  date: string;
  position: number;
}
export interface ProjectAssociations {
  memberIds: readonly string[];
  milestones: readonly MilestoneDtoInput[];
  isFavorite: boolean;
}
export function projectProjection(p: ProjectDtoInput, associations: ProjectAssociations) {
  return ProjectSchema.parse({
    id: p.id,
    workspaceId: p.workspaceId,
    key: p.key,
    name: p.name,
    description: p.description,
    icon: p.icon,
    color: p.color,
    status: p.status,
    teamId: p.teamId,
    leadId: p.leadId,
    startDate: p.startDate,
    dueDate: p.dueDate,
    visibility: p.visibility,
    ...associations,
    archivedAt: nullableInstant(p.archivedAt),
    createdAt: instant(p.createdAt),
    updatedAt: instant(p.updatedAt),
    lastActivityAt: instant(p.lastActivityAt),
    version: p.version,
  });
}
export function restrictedProjectProjection(
  p: ProjectDtoInput,
  lead: { id: string; name: string; avatarColor: string },
) {
  return RestrictedProjectSchema.parse({
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    key: p.key,
    icon: p.icon,
    color: p.color,
    status: p.status,
    dueDate: p.dueDate,
    lead: { id: lead.id, name: lead.name, avatarColor: lead.avatarColor },
    catalogSummary: p.description,
  });
}
