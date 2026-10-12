import type { WorkspaceContext } from '../../../shared/scope.ts';

import { readAccessSql as accessSql } from '../../projects/access.ts';
export const notificationFrom = `notifications n LEFT JOIN tasks t ON t.workspaceId=n.workspaceId AND t.id=n.taskId LEFT JOIN projects p ON p.workspaceId=n.workspaceId AND p.id=coalesce(t.projectId,n.projectId)`;
export const notificationVisible = `n.workspaceId=? AND n.recipientId=? AND (n.taskId IS NULL OR (t.id IS NOT NULL AND t.deletedAt IS NULL AND (n.projectId IS NULL OR n.projectId=t.projectId))) AND ((n.projectId IS NULL AND n.taskId IS NULL) OR (p.id IS NOT NULL AND p.deletedAt IS NULL AND ${accessSql}))`;

export const parameters = (s: WorkspaceContext) => [s.workspaceId, s.memberId, s.memberId];
