import { WorkspaceSchema } from '@studio/contracts/api';
import { instant } from '../../shared/clock.ts';
export interface WorkspaceDtoInput {
  id: string;
  name: string;
  slug: string;
  iconColor: string;
  brand: boolean | number;
  timezone: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  planLabel: string | null;
}
export function workspaceDto(row: WorkspaceDtoInput) {
  return WorkspaceSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    iconColor: row.iconColor,
    brand: !!row.brand,
    timezone: row.timezone,
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    version: row.version,
    ...(row.planLabel === null ? {} : { planLabel: row.planLabel }),
  });
}
