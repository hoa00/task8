import { ActivitySchema, EntityIdSchema } from '@studio/contracts/api';
import { accessSql } from '../db/guards.ts';
import { member, projectRow } from './read-model.ts';
import { taskRow } from './task-read.ts';
import { instant, page } from './shared.ts';
import type { ActivityQuery } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
import type { activity } from '../db/schema.ts';
export async function listActivity(r:RequestRepository,s:WorkspaceContext,query:ActivityQuery) {
  if(query.taskId)await taskRow(r,s,query.taskId);
  if(query.projectId)await projectRow(r,s,query.projectId,true);
  if(query.actorId)await member(r,s,query.actorId);
  const rows=await r.all<typeof activity.$inferSelect>(`SELECT a.* FROM activity a
    LEFT JOIN tasks t ON t.workspaceId=a.workspaceId AND t.id=a.taskId
    LEFT JOIN projects p ON p.workspaceId=a.workspaceId AND p.id=coalesce(t.projectId,a.projectId)
    WHERE a.workspaceId=? AND a.revertedAt IS NULL
    AND (a.actorId IS NULL OR EXISTS (SELECT 1 FROM workspaceMembers m WHERE m.workspaceId=a.workspaceId AND m.id=a.actorId AND m.removedAt IS NULL))
    AND (a.taskId IS NULL OR (t.id IS NOT NULL AND t.deletedAt IS NULL AND (a.projectId IS NULL OR a.projectId=t.projectId)))
    AND (coalesce(t.projectId,a.projectId) IS NULL OR (p.id IS NOT NULL AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${accessSql}))
    ${query.projectId?'AND coalesce(t.projectId,a.projectId)=?':''} ${query.taskId?'AND a.taskId=?':''} ${query.actorId?'AND a.actorId=?':''}
    ORDER BY a.createdAt DESC,a.id DESC`,[s.workspaceId,s.memberId,...(query.projectId?[query.projectId]:[]),...(query.taskId?[query.taskId]:[]),...(query.actorId?[query.actorId]:[])]);
  const items=rows.map(a=>ActivitySchema.parse({id:EntityIdSchema.parse(a.id),actorId:a.actorId,eventType:a.eventType,taskId:a.taskId,projectId:a.projectId,createdAt:instant(a.createdAt),payload:JSON.parse(a.payloadJson)}));
  return page(items,query,{scope:s,kind:'activity',projectId:query.projectId,taskId:query.taskId,actorId:query.actorId},row=>row.createdAt,'updated');
}
