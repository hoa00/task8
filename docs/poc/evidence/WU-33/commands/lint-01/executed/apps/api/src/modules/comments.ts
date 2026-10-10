import { CommentSchema, EntityIdSchema, ReactionSchema } from '@studio/contracts/api';
import { ApiFailure } from '../errors.ts';
import { gatedInsert, matchedBatch } from '../db/commands.ts';
import { decodeUndoPayload, decodeUndoResult, encodeUndoPayload, encodeUndoResult } from '../db/undo.ts';
import { childEvent, childGate, writableTask } from './task-children.ts';
import { projectRow } from './read-model.ts';
import { taskDto, taskRow, taskSelect } from './task-read.ts';
import { fitBatch, instant, newId } from './shared.ts';
import { historyPage } from './collaboration-page.ts';
import type { CreateCommentInput, EntityId, ReactionDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
import type { comments, commandUndoRecords } from '../db/schema.ts';
import type { TaskProjection } from './task-read.ts';
type CommentRow=Omit<typeof comments.$inferSelect,'mentionedMemberIdsJson'> & {mentionedMemberIdsJson:string};
export async function commentRow(r:RequestRepository,s:WorkspaceContext,id:EntityId,deleted=false) {
  const [row]=await r.all<CommentRow>(`SELECT * FROM comments WHERE workspaceId=? AND id=? ${deleted?'':'AND deletedAt IS NULL'}`,[s.workspaceId,id]);
  if(!row)throw new ApiFailure('NOT_FOUND','Comment not found');
  await taskRow(r,s,EntityIdSchema.parse(row.taskId));return row;
}
async function reactions(r:RequestRepository,s:WorkspaceContext,id:string):Promise<ReactionDto[]> {
  const rows=await r.all<{reactionKey:string;memberId:string}>('SELECT reactionKey,memberId FROM commentReactions WHERE workspaceId=? AND commentId=? ORDER BY reactionKey,memberId',[s.workspaceId,id]);
  return [...new Set(rows.map(row=>row.reactionKey))].map(key=>{const memberIds=rows.filter(row=>row.reactionKey===key).map(row=>row.memberId);return ReactionSchema.parse({key,count:memberIds.length,memberIds});});
}
async function commentDto(r:RequestRepository,s:WorkspaceContext,row:CommentRow) {return CommentSchema.parse({id:row.id,workspaceId:row.workspaceId,taskId:row.taskId,authorId:row.authorId,bodyText:row.bodyText,mentionedMemberIds:JSON.parse(row.mentionedMemberIdsJson),createdAt:instant(row.createdAt),version:row.version,reactions:await reactions(r,s,row.id)});}
export async function listComments(r:RequestRepository,s:WorkspaceContext,id:EntityId,query:{cursor?:string|undefined;limit:number}) {
  await taskRow(r,s,id);
  // One query projects all reactions, so pagination never spends one query per child.
  const rows=await r.all<CommentRow & {reactionsJson:string}>(`SELECT c.*,(SELECT json_group_array(json_object('key',reactionKey,'memberId',memberId)) FROM (SELECT reactionKey,memberId FROM commentReactions WHERE workspaceId=c.workspaceId AND commentId=c.id ORDER BY reactionKey,memberId)) reactionsJson FROM comments c WHERE c.workspaceId=? AND c.taskId=? AND c.deletedAt IS NULL ORDER BY c.createdAt,c.id`,[s.workspaceId,id]);
  const items=rows.map(row=>{const values=JSON.parse(row.reactionsJson) as {key:string;memberId:string}[];return CommentSchema.parse({id:row.id,workspaceId:row.workspaceId,taskId:row.taskId,authorId:row.authorId,bodyText:row.bodyText,mentionedMemberIds:JSON.parse(row.mentionedMemberIdsJson),createdAt:instant(row.createdAt),version:row.version,reactions:[...new Set(values.map(v=>v.key))].map(key=>{const memberIds=values.filter(v=>v.key===key).map(v=>v.memberId);return {key,count:memberIds.length,memberIds};})});});
  return historyPage(items,query,{scope:s,kind:'comments',taskId:id});
}
export async function createComment(r:RequestRepository,s:WorkspaceContext,id:EntityId,body:CreateCommentInput,now:number) {
  const task=await writableTask(r,s,id),mentions=JSON.stringify(body.mentionedMemberIds);
  const guard={sql:'NOT EXISTS (SELECT 1 FROM json_each(?) mention WHERE NOT EXISTS (SELECT 1 FROM workspaceMembers m WHERE m.workspaceId=? AND m.id=mention.value AND m.removedAt IS NULL))',parameters:[mentions,s.workspaceId]};
  const [valid]=await r.all<{valid:number}>(`SELECT ${guard.sql} valid`,guard.parameters);
  if(!valid?.valid)throw new ApiFailure('VALIDATION_ERROR','Mentioned member is not in this workspace');
  const marker=newId(),row:CommentRow={id:newId(),workspaceId:s.workspaceId,taskId:id,authorId:s.memberId,bodyText:body.bodyText,mentionedMemberIdsJson:mentions,createdAt:now,updatedAt:now,deletedAt:null,deletedBy:null,version:1,lastMutationId:marker};
  const {root,gate}=childGate(r,s,task,marker,now,[guard],null),statements=[root,gatedInsert(r,'comments',[row],gate),gatedInsert(r,'activity',[{...childEvent(s,task,now,'comment.created'),commandId:marker}],gate),r.prepare(`${taskSelect} WHERE t.workspaceId=? AND t.id=? AND ${gate.sql}`,[s.memberId,s.memberId,s.workspaceId,id,...gate.parameters])];
  fitBatch(r,statements.length,1);const result=await matchedBatch(r,statements);
  return {comment:await commentDto(r,s,row),task:taskDto(result.at(-1)!.results[0] as TaskProjection),undo:null};
}
export async function lifecycleComment(r:RequestRepository,s:WorkspaceContext,id:EntityId,expectedVersion:number,restore:boolean,now:number) {
  const old=await commentRow(r,s,id,restore);
  if(old.authorId!==s.memberId)throw new ApiFailure('NOT_FOUND','Comment not found');
  if(old.version!==expectedVersion||restore&&(old.deletedAt===null||old.deletedBy!==s.memberId))throw new ApiFailure('CONFLICT','Comment version or lifecycle changed');
  const task=await writableTask(r,s,EntityIdSchema.parse(old.taskId)),marker=newId();
  const guard={sql:'EXISTS (SELECT 1 FROM comments WHERE workspaceId=? AND id=? AND taskId=? AND authorId=? AND version=? AND deletedAt IS ? AND deletedBy IS ?)',parameters:[s.workspaceId,id,task.id,s.memberId,expectedVersion,old.deletedAt,old.deletedBy]};
  const {root,gate}=childGate(r,s,task,marker,now,[guard]),row={...old,version:old.version+1,updatedAt:now,deletedAt:restore?null:now,deletedBy:restore?null:s.memberId,lastMutationId:marker};
  const undo=restore?null:{id:newId(),kind:'comment.delete' as const};
  const payload=undo?encodeUndoPayload({kind:'comment.delete',targets:[{id,postVersion:row.version,taskId:task.id,taskPostVersion:task.version+1,before:{archivedAt:null,deletedAt:old.deletedAt,deletedBy:old.deletedBy,updatedAt:instant(old.updatedAt)}}],activityIds:[]}):null;
  const statements=[root,r.prepare(`UPDATE comments SET version=version+1,updatedAt=?,deletedAt=?,deletedBy=?,lastMutationId=? WHERE workspaceId=? AND id=? AND ${gate.sql}`,[now,row.deletedAt,row.deletedBy,marker,s.workspaceId,id,...gate.parameters])];
  if(undo)statements.push(r.prepare(`INSERT INTO commandUndoRecords(id,workspaceId,actorMemberId,kind,payloadVersion,payloadJson,createdAt,consumedAt,resultJson) SELECT ?,?,?,?,1,json_set(?,'$.targets[0].postVersion',(SELECT version FROM comments WHERE workspaceId=? AND id=?),'$.targets[0].taskPostVersion',(SELECT version FROM tasks WHERE workspaceId=? AND id=?)),?,NULL,NULL WHERE ${gate.sql}`,[undo.id,s.workspaceId,s.memberId,undo.kind,payload!,s.workspaceId,id,s.workspaceId,task.id,now,...gate.parameters]));
  statements.push(r.prepare(`${taskSelect} WHERE t.workspaceId=? AND t.id=? AND ${gate.sql}`,[s.memberId,s.memberId,s.workspaceId,task.id,...gate.parameters]));
  fitBatch(r,statements.length,1);const result=await matchedBatch(r,statements);
  return {comment:await commentDto(r,s,row),task:taskDto(result.at(-1)!.results[0] as TaskProjection),undo};
}
export async function reactComment(r:RequestRepository,s:WorkspaceContext,id:EntityId,key:string,add:boolean,now:number) {
  const old=await commentRow(r,s,id),task=await writableTask(r,s,EntityIdSchema.parse(old.taskId)),marker=newId();
  const current=await reactions(r,s,id),exists=current.some(row=>row.key===key&&row.memberIds.includes(s.memberId));
  if(exists===add)return current;
  const guard={sql:`EXISTS (SELECT 1 FROM comments WHERE workspaceId=? AND id=? AND taskId=? AND deletedAt IS NULL) AND ${add?'NOT ':''}EXISTS (SELECT 1 FROM commentReactions WHERE workspaceId=? AND commentId=? AND memberId=? AND reactionKey=?)`,parameters:[s.workspaceId,id,task.id,s.workspaceId,id,s.memberId,key]};
  const {root,gate}=childGate(r,s,task,marker,now,[guard],null),statements=[root,r.prepare(`UPDATE comments SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND ${gate.sql}`,[now,marker,s.workspaceId,id,...gate.parameters])];
  statements.push(add?gatedInsert(r,'commentReactions',[{workspaceId:s.workspaceId,commentId:id,memberId:s.memberId,reactionKey:key,createdAt:now}],gate):r.prepare(`DELETE FROM commentReactions WHERE workspaceId=? AND commentId=? AND memberId=? AND reactionKey=? AND ${gate.sql}`,[s.workspaceId,id,s.memberId,key,...gate.parameters]));
  fitBatch(r,statements.length,5);const results=await r.batch(statements);
  if(results[0]?.meta.changes!==1) {
    // Concurrent identical operations replay the authorized current state without writes.
    const row=await commentRow(r,s,id);await writableTask(r,s,EntityIdSchema.parse(row.taskId));const latest=await reactions(r,s,id);
    if(latest.some(row=>row.key===key&&row.memberIds.includes(s.memberId))!==add)throw new ApiFailure('CONFLICT','Comment scope or reaction changed');return latest;
  }
  return reactions(r,s,id);
}
export async function undoComment(r:RequestRepository,s:WorkspaceContext,record:typeof commandUndoRecords.$inferSelect,now:number) {
  const payload=decodeUndoPayload(record.payloadJson);
  if(payload.kind!=='comment.delete'||record.kind!==payload.kind)throw new ApiFailure('INTERNAL_ERROR','Invalid comment Undo');
  const target=payload.targets[0]!,[old]=await r.all<CommentRow>('SELECT * FROM comments WHERE workspaceId=? AND id=? AND authorId=?',[s.workspaceId,target.id,s.memberId]);
  if(!old||old.taskId!==target.taskId)throw new ApiFailure('NOT_FOUND','Comment not found');
  const [parent]=await r.all<{projectId:string;deletedAt:number|null}>('SELECT projectId,deletedAt FROM tasks WHERE workspaceId=? AND id=?',[s.workspaceId,target.taskId]);
  if(!parent||parent.deletedAt!==null)throw new ApiFailure('NOT_FOUND','Task not found');
  await projectRow(r,s,EntityIdSchema.parse(parent.projectId),false,false,true);
  const task=await taskRow(r,s,target.taskId);
  if(record.resultJson!==null)return decodeUndoResult(record.resultJson);
  if(task.archivedAt!==null)throw new ApiFailure('CONFLICT','Restore task before Undo');
  const marker=newId(),guard={sql:'EXISTS (SELECT 1 FROM comments WHERE workspaceId=? AND id=? AND taskId=? AND authorId=? AND version=? AND deletedAt=? AND deletedBy=?) AND EXISTS (SELECT 1 FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL)',parameters:[s.workspaceId,target.id,target.taskId,s.memberId,target.postVersion,record.createdAt,s.memberId,s.workspaceId,record.id,s.memberId]};
  const {root,gate}=childGate(r,s,task,marker,now,[guard],target.taskPostVersion),result=encodeUndoResult({undoId:record.id,kind:payload.kind,appliedAt:instant(now),affected:{taskIds:[task.id],projectIds:[task.projectId],teamIds:[],memberIds:[],commentIds:[target.id],fileIds:[]}});
  const statements=[root,r.prepare(`UPDATE comments SET deletedAt=NULL,deletedBy=NULL,updatedAt=?,version=version+1,lastMutationId=? WHERE workspaceId=? AND id=? AND ${gate.sql}`,[now,marker,s.workspaceId,target.id,...gate.parameters]),r.prepare(`UPDATE commandUndoRecords SET consumedAt=?,resultJson=? WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL AND ${gate.sql}`,[now,result,s.workspaceId,record.id,s.memberId,...gate.parameters])];
  fitBatch(r,statements.length,1);const results=await r.batch(statements);
  if(results[0]?.meta.changes!==1){const [latest]=await r.all<{resultJson:string|null}>('SELECT resultJson FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=?',[s.workspaceId,record.id,s.memberId]);if(latest?.resultJson)return decodeUndoResult(latest.resultJson);throw new ApiFailure('CONFLICT','Comment Undo targets changed');}
  return decodeUndoResult(result);
}
