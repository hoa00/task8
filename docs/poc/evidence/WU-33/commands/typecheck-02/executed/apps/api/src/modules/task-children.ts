import { EntityIdSchema, SubtaskSchema } from '@studio/contracts/api';
import { plainDescriptionHtml } from '@studio/domain';
import { ApiFailure } from '../errors.ts';
import { exactSet, gatedInsert, matchedBatch } from '../db/commands.ts';
import { projectRow, writeAccessSql } from './read-model.ts';
import { taskDetail, taskDto, taskRow, taskSelect } from './task-read.ts';
import { normalizeTaskDescription, validateRelations } from './task-relations.ts';
import { actorParameters, actorSql, fitBatch, newId } from './shared.ts';
import type { CreateSubtaskInput, EntityId, UpdateSubtaskInput } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
import type { SqlPredicate } from '../db/commands.ts';
import type { SubtaskRow, TaskRow } from './read-model.ts';
import type { TaskProjection } from './task-read.ts';

export async function writableTask(r:RequestRepository,s:WorkspaceContext,id:EntityId) {
  const task=await taskRow(r,s,id);
  if(task.archivedAt!==null)throw new ApiFailure('CONFLICT','Restore task before editing');
  await projectRow(r,s,EntityIdSchema.parse(task.projectId),true,false,true);
  return task;
}
// The task is the aggregate root. Every side effect uses this attempt's fresh marker.
export function childGate(r:RequestRepository,s:WorkspaceContext,t:TaskProjection,marker:string,now:number,guards:SqlPredicate[]=[],expectedVersion:number|null=t.version) {
  const gate={sql:'EXISTS (SELECT 1 FROM tasks gate WHERE gate.workspaceId=? AND gate.id=? AND gate.lastMutationId=?)',parameters:[s.workspaceId,t.id,marker]};
  const root=r.prepare(`UPDATE tasks SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND projectId=? ${expectedVersion===null?'':'AND version=?'} AND archivedAt IS NULL AND deletedAt IS NULL AND ${actorSql()} AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${writeAccessSql}) ${guards.map(g=>`AND (${g.sql})`).join(' ')}`,[now,marker,s.workspaceId,t.id,t.projectId,...(expectedVersion===null?[]:[expectedVersion]),...actorParameters(s),s.memberId,...guards.flatMap(g=>g.parameters)]);
  return {root,gate};
}
export function childEvent(s:WorkspaceContext,t:TaskProjection,now:number,eventType:string,detail?:string) {
  return {id:newId(),workspaceId:s.workspaceId,projectId:t.projectId,taskId:t.id,actorId:s.memberId,eventType,payloadJson:JSON.stringify({taskKey:`${t.projectKey}-${t.number}`,taskTitle:t.title,...(detail?{detail}: {})}),commandId:null,revertedAt:null,createdAt:now};
}
export async function mutateSubtask(r:RequestRepository,s:WorkspaceContext,id:EntityId,input:CreateSubtaskInput|UpdateSubtaskInput|{expectedTaskVersion:number},now:number,operation:'create'|'update'|'delete'|'promote',childId?:EntityId) {
  const task=await writableTask(r,s,id);
  if(task.version!==input.expectedTaskVersion)throw new ApiFailure('CONFLICT','Task version changed');
  const children=await r.all<SubtaskRow>('SELECT * FROM subtasks WHERE workspaceId=? AND taskId=? ORDER BY position,id',[s.workspaceId,id]);
  const old=children.find(c=>c.id===childId);
  if(operation!=='create'&&!old)throw new ApiFailure('NOT_FOUND','Subtask not found');
  if(operation==='create'&&children.length>=128)throw new ApiFailure('PAYLOAD_TOO_LARGE','A task can contain at most 128 subtasks');
  const patch=Object.fromEntries(Object.entries(input).filter(([key,value])=>key!=='expectedTaskVersion'&&value!==undefined));
  const child=operation==='create'?{...patch,id:newId(),workspaceId:s.workspaceId,taskId:id,position:Math.max(-100,...children.map(c=>c.position))+100,createdAt:now,updatedAt:now} as SubtaskRow:{...old!,...patch,updatedAt:now};
  // Canonical fields remain text; only the promoted rich description uses HTML mapping.
  SubtaskSchema.parse({id:child.id,taskId:id,title:child.title,done:!!child.done,assigneeId:child.assigneeId,dueDate:child.dueDate,note:child.note,position:child.position});
  let created:TaskRow|undefined;
  const marker=newId(),guards=[exactSet('subtasks','workspaceId=? AND taskId=?',[s.workspaceId,id],children,['id','title','done','assigneeId','dueDate','note','position','createdAt','updatedAt'])];
  if(operation==='create'||operation==='update')guards.push(await validateRelations(r,s,[{id,projectId:task.projectId,assigneeId:task.assigneeId,dependencyIds:[],subtaskAssigneeIds:[child.assigneeId]}]));
  if(operation==='promote') {
    const description=normalizeTaskDescription(plainDescriptionHtml(old!.note));
    created={id:newId(),workspaceId:s.workspaceId,projectId:task.projectId,number:0,title:old!.title,descriptionHtml:description.html,descriptionText:description.text,status:old!.done?'done':'todo',priority:task.priority,assigneeId:old!.assigneeId??task.assigneeId,startDate:null,dueDate:old!.dueDate,estimate:null,recurrence:null,position:0,completedAt:old!.done?now:null,previousStatus:old!.done?'todo':null,recurrenceSourceTaskId:null,cancelledByUndoId:null,createdBy:s.memberId,createRequestId:null,createRequestHash:null,createdAt:now,updatedAt:now,archivedAt:null,deletedAt:null,deletedBy:null,version:1,lastMutationId:marker};
    guards.push(await validateRelations(r,s,[{id:created.id,projectId:created.projectId,assigneeId:created.assigneeId,dependencyIds:[],subtaskAssigneeIds:[]}]));
  }
  const {root,gate}=childGate(r,s,task,marker,now,guards),statements=[root];
  if(operation==='create')statements.push(gatedInsert(r,'subtasks',[{...child,done:child.done?1:0}],gate));
  else if(operation==='update')statements.push(r.prepare(`UPDATE subtasks SET title=?,done=?,assigneeId=?,dueDate=?,note=?,updatedAt=? WHERE workspaceId=? AND taskId=? AND id=? AND ${gate.sql}`,[child.title,child.done?1:0,child.assigneeId,child.dueDate,child.note,now,s.workspaceId,id,child.id,...gate.parameters]));
  else statements.push(r.prepare(`DELETE FROM subtasks WHERE workspaceId=? AND taskId=? AND id=? AND ${gate.sql}`,[s.workspaceId,id,old!.id,...gate.parameters]));
  if(created) {
    statements.push(r.prepare(`UPDATE projects SET taskSequence=taskSequence+1 WHERE workspaceId=? AND id=? AND ${gate.sql}`,[s.workspaceId,task.projectId,...gate.parameters]));
    const columns=Object.keys(created),json=JSON.stringify(created);
    statements.push(r.prepare(`INSERT INTO tasks(${columns.join(',')}) SELECT ${columns.map(c=>c==='number'?'p.taskSequence':c==='position'?'(SELECT max(0,coalesce(max(position),0))+100 FROM tasks WHERE workspaceId=?)':`json_extract(?,'$.${c}')`).join(',')} FROM projects p WHERE p.workspaceId=? AND p.id=? AND ${gate.sql}`,[...columns.filter(c=>c!=='number').map(c=>c==='position'?s.workspaceId:json),s.workspaceId,task.projectId,...gate.parameters]));
    const labels=JSON.parse(task.labelsJson) as string[];
    if(labels.length)statements.push(gatedInsert(r,'taskLabels',labels.map(labelId=>({workspaceId:s.workspaceId,taskId:created!.id,labelId})),gate));
    const parentEvent=childEvent(s,task,now,'task.updated'),newEvent=childEvent(s,{...task,...created},now,'task.created');
    statements.push(r.prepare(`INSERT INTO activity(id,workspaceId,projectId,taskId,actorId,eventType,payloadJson,commandId,revertedAt,createdAt) SELECT ?,?,?,?,?,?,json_set(?,'$.detail','converted a subtask into '||?||'-'||p.taskSequence),?,NULL,? FROM projects p WHERE p.workspaceId=? AND p.id=? AND ${gate.sql}`,[parentEvent.id,s.workspaceId,task.projectId,id,s.memberId,'task.updated',parentEvent.payloadJson,task.projectKey,marker,now,s.workspaceId,task.projectId,...gate.parameters]));
    statements.push(r.prepare(`INSERT INTO activity(id,workspaceId,projectId,taskId,actorId,eventType,payloadJson,commandId,revertedAt,createdAt) SELECT ?,?,?,?,?,?,json_set(?,'$.taskKey',?||'-'||p.taskSequence),?,NULL,? FROM projects p WHERE p.workspaceId=? AND p.id=? AND ${gate.sql}`,[newEvent.id,s.workspaceId,task.projectId,created.id,s.memberId,'task.created',newEvent.payloadJson,task.projectKey,marker,now,s.workspaceId,task.projectId,...gate.parameters]));
    statements.push(r.prepare(`${taskSelect} WHERE t.workspaceId=? AND t.id IN (?,?) AND ${gate.sql}`,[s.memberId,s.memberId,s.workspaceId,id,created.id,...gate.parameters]));
    fitBatch(r,statements.length,0);const result=await matchedBatch(r,statements),rows=result.at(-1)!.results as TaskProjection[];
    return {task:taskDto(rows.find(t=>t.id===id)!),createdTasks:[taskDto(rows.find(t=>t.id===created!.id)!)],affectedProjectIds:[EntityIdSchema.parse(task.projectId)],undo:null};
  }
  if(operation==='create'||operation==='update'&&!!old!.done!==!!child.done)statements.push(gatedInsert(r,'activity',[{...childEvent(s,task,now,'task.updated',`${operation==='create'?'added':child.done?'completed':'reopened'} subtask “${child.title}”`),commandId:marker}],gate));
  fitBatch(r,statements.length,3);await matchedBatch(r,statements);return taskDetail(r,s,id);
}
