import type { EntityId } from '@studio/contracts/api';
import { sql } from 'drizzle-orm';
import type { projects } from '../../../db/schema.ts';

// Alias p is an internal SQL identifier used by every public project predicate.
export const readAccessSql = `(p.visibility = 'workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=?))`;
export const writeAccessSql = `(p.visibility='workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=? AND pm.permission='edit'))`;
export type ProjectLifecycle = 'detail' | 'active' | 'including-deleted';
export const projectLifecycleSql = (mode: ProjectLifecycle) =>
  mode === 'active'
    ? ' AND p.archivedAt IS NULL AND p.deletedAt IS NULL'
    : mode === 'detail'
      ? ' AND p.deletedAt IS NULL'
      : '';

export function readAccessExpression(project: typeof projects, memberId: EntityId) {
  return sql`(${project.visibility} = 'workspace' OR EXISTS (SELECT 1 FROM projectMembers visible WHERE visible.workspaceId=${project.workspaceId} AND visible.projectId=${project.id} AND visible.memberId=${memberId}))`;
}
