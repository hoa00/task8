import { CursorPayloadSchema, FileSchema, SubtaskSchema, TaskSchema } from '@studio/contracts/api';
import { compareTaskTuple, filterTasks, sortTasks, summarizeTasks, taskSortValue } from '@studio/domain';
import { accessSql } from '../db/guards.ts';
import { ApiFailure } from '../errors.ts';
import { members, today } from './read-model.ts';
import { instant, nullableInstant } from './shared.ts';
import type { EntityId, TaskQuery } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
import type { files } from '../db/schema.ts';
import type { TaskRow, SubtaskRow } from './read-model.ts';

export type TaskProjection = TaskRow & {projectKey:string;labelsJson:string;dependenciesJson:string;visibleDependenciesJson:string;subtaskTotal:number;subtaskDone:number;attachmentCount:number;commentCount:number;favorite:number};
// One projection is used by reads and the final SELECT inside command batches.
export const taskSelect = `SELECT t.*,p.key projectKey,
 (SELECT json_group_array(labelId) FROM (SELECT labelId FROM taskLabels WHERE workspaceId=t.workspaceId AND taskId=t.id ORDER BY labelId)) labelsJson,
 (SELECT json_group_array(dependsOnTaskId) FROM (SELECT dependsOnTaskId FROM taskDependencies WHERE workspaceId=t.workspaceId AND taskId=t.id ORDER BY dependsOnTaskId)) dependenciesJson,
 (SELECT json_group_array(d.dependsOnTaskId) FROM taskDependencies d JOIN tasks dep ON dep.workspaceId=d.workspaceId AND dep.id=d.dependsOnTaskId JOIN projects dp ON dp.workspaceId=dep.workspaceId AND dp.id=dep.projectId WHERE d.workspaceId=t.workspaceId AND d.taskId=t.id AND dep.archivedAt IS NULL AND dep.deletedAt IS NULL AND dp.archivedAt IS NULL AND dp.deletedAt IS NULL AND (dp.visibility='workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=dp.workspaceId AND pm.projectId=dp.id AND pm.memberId=?))) visibleDependenciesJson,
 (SELECT count(*) FROM subtasks WHERE workspaceId=t.workspaceId AND taskId=t.id) subtaskTotal,
 (SELECT count(*) FROM subtasks WHERE workspaceId=t.workspaceId AND taskId=t.id AND done=1) subtaskDone,
 (SELECT count(*) FROM files WHERE workspaceId=t.workspaceId AND taskId=t.id AND deletedAt IS NULL) attachmentCount,
 (SELECT count(*) FROM comments WHERE workspaceId=t.workspaceId AND taskId=t.id AND deletedAt IS NULL) commentCount,
 EXISTS (SELECT 1 FROM taskFavorites WHERE workspaceId=t.workspaceId AND taskId=t.id AND memberId=?) favorite
 FROM tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId`;
export function taskDto(t:TaskProjection) {
  return TaskSchema.parse({id:t.id,workspaceId:t.workspaceId,projectId:t.projectId,key:`${t.projectKey}-${t.number}`,title:t.title,descriptionHtml:t.descriptionHtml,status:t.status,assigneeId:t.assigneeId,priority:t.priority,startDate:t.startDate,dueDate:t.dueDate,estimate:t.estimate,recurrence:t.recurrence,labelIds:JSON.parse(t.labelsJson),dependencyIds:JSON.parse(t.visibleDependenciesJson),position:t.position,completedAt:nullableInstant(t.completedAt),archivedAt:nullableInstant(t.archivedAt),createdAt:instant(t.createdAt),updatedAt:instant(t.updatedAt),version:t.version,isFavorite:!!t.favorite,subtaskSummary:{total:t.subtaskTotal,completed:t.subtaskDone},attachmentCount:t.attachmentCount,commentCount:t.commentCount});
}
export async function taskRow(r:RequestRepository,s:WorkspaceContext,id:EntityId,deleted=false) {
  const [row]=await r.all<TaskProjection>(`${taskSelect} WHERE t.workspaceId=? AND t.id=? ${deleted?'':'AND t.deletedAt IS NULL'} AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${accessSql}`,[s.memberId,s.memberId,s.workspaceId,id,s.memberId]);
  if(!row)throw new ApiFailure('NOT_FOUND','Task not found');return row;
}
export async function taskDetail(r:RequestRepository,s:WorkspaceContext,id:EntityId) {
  const row=await taskRow(r,s,id),children=await r.all<SubtaskRow>('SELECT * FROM subtasks WHERE workspaceId=? AND taskId=? ORDER BY position,id',[s.workspaceId,id]);
  const attachments=await r.all<typeof files.$inferSelect>('SELECT * FROM files WHERE workspaceId=? AND taskId=? AND deletedAt IS NULL ORDER BY createdAt,id',[s.workspaceId,id]);
  return {task:taskDto(row),subtasks:children.map(c=>SubtaskSchema.parse({id:c.id,taskId:c.taskId,title:c.title,done:!!c.done,assigneeId:c.assigneeId,dueDate:c.dueDate,note:c.note,position:c.position})),attachments:attachments.map(f=>FileSchema.parse({id:f.id,workspaceId:f.workspaceId,projectId:f.projectId,taskId:f.taskId,name:f.name,fileType:f.fileType,mimeType:f.mimeType,sizeBytes:f.sizeBytes,displaySize:f.displaySize,storageMode:f.storageMode,contentAvailable:f.storageMode==='r2',createdBy:f.createdBy,createdAt:instant(f.createdAt),version:f.version}))};
}
export async function taskDataset(r:RequestRepository,s:WorkspaceContext,now:number) {
  const rows=await r.all<TaskProjection>(`${taskSelect} WHERE t.workspaceId=? AND t.deletedAt IS NULL AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${accessSql}`,[s.memberId,s.memberId,s.workspaceId,s.memberId]);
  const ms=await members(r,s),ps=await r.all<{id:EntityId;name:string;color:string}>(`SELECT p.id,p.name,p.color FROM projects p WHERE p.workspaceId=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${accessSql}`,[s.workspaceId,s.memberId]);
  return {rows,items:rows.map(taskDto),env:{today:await today(r,s,now),now,lookups:{members:ms,projects:ps}}};
}
export async function queryTasks(r:RequestRepository,s:WorkspaceContext,query:TaskQuery,now:number,summary=false) {
  const dataset=await taskDataset(r,s,now),rows=sortTasks(filterTasks(dataset.items,query,dataset.env),query,dataset.env.lookups);
  if(summary)return summarizeTasks(rows,dataset.env.today);
  const fingerprintInput={scope:s,query:{...query,cursor:undefined,limit:undefined}};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(fingerprintInput))),fingerprint=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  let selected=rows;
  if(query.cursor) {
    try {const decoded=new TextDecoder().decode(Uint8Array.from(atob(query.cursor.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))),cursor=CursorPayloadSchema.parse(JSON.parse(decoded));if(cursor.queryFingerprint!==fingerprint||cursor.sortField!==query.sortField||cursor.sortDirection!==query.sortDirection)throw new Error();selected=rows.filter(row=>compareTaskTuple({value:taskSortValue(row,query.sortField,dataset.env.lookups),id:row.id},{value:cursor.sortValue,id:cursor.id},query.sortDirection)>0);}
    catch {throw new ApiFailure('VALIDATION_ERROR','Invalid cursor for query');}
  }
  const items=selected.slice(0,query.limit),last=items.at(-1),cursor=last?JSON.stringify({formatVersion:1,queryFingerprint:fingerprint,sortField:query.sortField,sortDirection:query.sortDirection,sortValue:taskSortValue(last,query.sortField,dataset.env.lookups),id:last.id}):'';
  return {items,total:rows.length,nextCursor:selected.length>items.length&&last?btoa(String.fromCharCode(...new TextEncoder().encode(cursor))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''):null};
}
