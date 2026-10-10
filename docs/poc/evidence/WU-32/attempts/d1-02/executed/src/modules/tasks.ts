import { EntityIdSchema, TaskQuerySchema, priorities } from '@studio/contracts/api';
import { changedDependencyTargets, filterTasks, groupTasks, nextRecurrenceDate, normalizeDescription } from '@studio/domain';
import { ApiFailure } from '../errors.ts';
import { exactSet, gatedInsert } from '../db/commands.ts';
import { encodeUndoPayload } from '../db/undo.ts';
import { actorParameters, actorSql, fitBatch, instant, markerSql, newId, nullableInstant } from './shared.ts';
import { taskDataset, taskDto, taskRow, taskSelect } from './task-read.ts';
import { validateRelations } from './task-relations.ts';
import type { TaskRelations } from './task-relations.ts';
import type { TaskProjection } from './task-read.ts';
import type { TaskRow, SubtaskRow } from './read-model.ts';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
import type { SqlPredicate } from '../db/commands.ts';
import type { BulkMutateTasksInput, CreateTaskInput, DuplicateTaskInput, EntityId, MoveTaskInput, SetTaskCompletionInput, UpdateTaskInput, UndoDescriptor } from '@studio/contracts/api';

interface Plan {
  before:TaskProjection[];changed:TaskRow[];created:TaskRow[];children:SubtaskRow[];
  labels:{workspaceId:string;taskId:string;labelId:string}[];dependencies:{workspaceId:string;taskId:string;dependsOnTaskId:string}[];
  replaceLabels:string[];replaceDependencies:string[];guards:SqlPredicate[];
  undo:UndoDescriptor|null;undoPayload:string|null;events:Record<string,unknown>[];
  allocations:{projectId:string;count:number}[];request?:{id:string;hash:string};lifecycle?:boolean;sourceChildren?:SubtaskRow[];slots?:TaskRow[];
}
const fields=['projectId','number','title','descriptionHtml','descriptionText','status','priority','assigneeId','startDate','dueDate','estimate','recurrence','position','completedAt','previousStatus','updatedAt','archivedAt','deletedAt','deletedBy','lastMutationId'] as const;
const empty=():Plan=>({before:[],changed:[],created:[],children:[],labels:[],dependencies:[],replaceLabels:[],replaceDependencies:[],guards:[],undo:null,undoPayload:null,events:[],allocations:[]});
function sanitizeDescription(value:string) {const normalized=normalizeDescription(value);if(normalized.html.length>100000)throw new ApiFailure('VALIDATION_ERROR','Sanitized description exceeds limit');return normalized;}
function merge<T extends object>(row:T,patch:{[K in keyof T]?:T[K]|undefined}):T {return {...row,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined))};}
const dependencyIds=(t:TaskProjection):string[]=>JSON.parse(t.dependenciesJson);
const visibleDependencies=(t:TaskProjection):string[]=>JSON.parse(t.visibleDependenciesJson);
const labelIds=(t:TaskProjection):string[]=>JSON.parse(t.labelsJson);
const relation=(t:TaskRow,deps:string[]=[],children:SubtaskRow[]=[]):TaskRelations=>({id:t.id,projectId:t.projectId,assigneeId:t.assigneeId,dependencyIds:deps,subtaskAssigneeIds:children.map(c=>c.assigneeId)});
export function transition(t:TaskRow,status:string,now:number):TaskRow {
  return {...t,status,completedAt:status==='done'?(t.status==='done'?t.completedAt:now):null,previousStatus:status==='done'&&t.status!=='done'?t.status:t.previousStatus};
}
const version=(row:TaskRow,expected:number)=>{if(row.version!==expected)throw new ApiFailure('CONFLICT','Task version changed');};
const active=(row:TaskRow)=>{if(row.archivedAt!==null||row.deletedAt!==null)throw new ApiFailure('CONFLICT','Restore task before editing');};
function event(s:WorkspaceContext,t:TaskRow,now:number,type:string) {return {id:newId(),workspaceId:s.workspaceId,projectId:t.projectId,taskId:t.id,actorId:s.memberId,eventType:type,payloadJson:JSON.stringify({taskTitle:t.title,status:t.status}),commandId:null,revertedAt:null,createdAt:now};}
function allocation(plan:Plan,projectId:string) {let row=plan.allocations.find(a=>a.projectId===projectId);if(!row){row={projectId,count:0};plan.allocations.push(row);}return ++row.count;}
function labelRows(s:WorkspaceContext,id:string,ids:string[]) {return ids.map(labelId=>({workspaceId:s.workspaceId,taskId:id,labelId}));}
function depRows(s:WorkspaceContext,id:string,ids:string[]) {return ids.map(dependsOnTaskId=>({workspaceId:s.workspaceId,taskId:id,dependsOnTaskId}));}
function baseTask(s:WorkspaceContext,body:CreateTaskInput,now:number):TaskRow {const description=sanitizeDescription(body.descriptionHtml);return {id:newId(),workspaceId:s.workspaceId,projectId:body.projectId,number:0,title:body.title,descriptionHtml:description.html,descriptionText:description.text,status:body.status,priority:body.priority,assigneeId:body.assigneeId,startDate:body.startDate,dueDate:body.dueDate,estimate:body.estimate,recurrence:body.recurrence,position:0,completedAt:body.status==='done'?now:null,previousStatus:body.status==='done'?'todo':null,recurrenceSourceTaskId:null,cancelledByUndoId:null,createdBy:s.memberId,createRequestId:body.clientRequestId,createRequestHash:null,createdAt:now,updatedAt:now,archivedAt:null,deletedAt:null,deletedBy:null,version:1,lastMutationId:null};}
async function copiedChildren(r:RequestRepository,s:WorkspaceContext,t:TaskProjection,plan:Plan,newTaskId:string) {
  const rows=plan.sourceChildren?plan.sourceChildren.filter(c=>c.taskId===t.id):await r.all<SubtaskRow>('SELECT * FROM subtasks WHERE workspaceId=? AND taskId=? ORDER BY position,id',[s.workspaceId,t.id]);
  if(!plan.sourceChildren)plan.guards.push(exactSet('subtasks','workspaceId=? AND taskId=?',[s.workspaceId,t.id],rows,['id','title','done','assigneeId','dueDate','note','position','createdAt','updatedAt']));
  const copied=rows.map(c=>({...c,id:newId(),taskId:newTaskId,done:false,createdAt:plan.created.find(n=>n.id===newTaskId)!.createdAt,updatedAt:plan.created.find(n=>n.id===newTaskId)!.updatedAt}));plan.children.push(...copied);return copied;
}
async function recurrence(r:RequestRepository,s:WorkspaceContext,old:TaskProjection,next:TaskRow,plan:Plan,now:number) {
  if(old.status==='done'||next.status!=='done'||!next.recurrence||!next.dueDate)return;
  const existing=plan.slots?plan.slots.filter(t=>t.recurrenceSourceTaskId===old.id):await r.all<TaskRow>('SELECT * FROM tasks WHERE workspaceId=? AND recurrenceSourceTaskId=?',[s.workspaceId,old.id]);
  if(!plan.slots)plan.guards.push(exactSet('tasks','workspaceId=? AND recurrenceSourceTaskId=?',[s.workspaceId,old.id],existing,['id','version','recurrenceSourceTaskId']));if(existing.length)return;
  const due=nextRecurrenceDate(next.dueDate as CreateTaskInput['dueDate'] & string,next.recurrence as NonNullable<CreateTaskInput['recurrence']>),id=newId();
  const created:TaskRow={...next,id,number:allocation(plan,next.projectId),position:0,status:'todo',completedAt:null,previousStatus:null,startDate:due,dueDate:due,createdBy:s.memberId,createRequestId:null,createRequestHash:null,createdAt:now,updatedAt:now,version:1,recurrenceSourceTaskId:old.id,lastMutationId:null};
  plan.created.push(created);plan.labels.push(...labelRows(s,id,plan.replaceLabels.includes(old.id)?plan.labels.filter(l=>l.taskId===old.id).map(l=>l.labelId):labelIds(old)));const deps=plan.replaceDependencies.includes(old.id)?plan.dependencies.filter(d=>d.taskId===old.id).map(d=>d.dependsOnTaskId):visibleDependencies(old);plan.dependencies.push(...depRows(s,id,deps));
  await copiedChildren(r,s,old,plan,id);plan.events.push(event(s,created,now,'task.created'));
}
function completionBefore(t:TaskRow) {return {status:t.status,completedAt:nullableInstant(t.completedAt),previousStatus:t.previousStatus,updatedAt:instant(t.updatedAt)};}
function lifecycleBefore(t:TaskRow) {return {archivedAt:nullableInstant(t.archivedAt),deletedAt:nullableInstant(t.deletedAt),deletedBy:t.deletedBy,updatedAt:instant(t.updatedAt)};}
function undoPlan(s:WorkspaceContext,plan:Plan,kind:UndoDescriptor['kind'],column=false) {
  plan.undo={id:newId(),kind};
  const targets:unknown[]=plan.changed.map(t=>{const old=plan.before.find(b=>b.id===t.id)!;return {id:t.id,postVersion:old.version+1,...(column?{entity:'parent'}:{}),before:kind==='task.complete'||kind==='tasks.completeColumn'?completionBefore(old):lifecycleBefore(old)};});
  if(column)targets.push(...plan.created.map(t=>({id:t.id,postVersion:1,entity:'successor',parentId:t.recurrenceSourceTaskId!,children:plan.children.filter(c=>c.taskId===t.id).map(({workspaceId:_,taskId:__,...c})=>{void _;void __;return {...c,done:!!c.done};}),labelIds:plan.labels.filter(l=>l.taskId===t.id).map(l=>l.labelId),dependencyIds:plan.dependencies.filter(d=>d.taskId===t.id).map(d=>d.dependsOnTaskId)})));
  plan.undoPayload=encodeUndoPayload({kind,targets,activityIds:plan.events.map(e=>e.id)});void s;
}
async function execute(r:RequestRepository,s:WorkspaceContext,plan:Plan,now:number) {
  if(plan.created.length+plan.children.length+plan.labels.length+plan.dependencies.length>512)throw new ApiFailure('VIEW_SCOPE_TOO_LARGE','Task command exceeds bounded child scope');
  const marker=newId(),gate:SqlPredicate={sql:markerSql('workspaces'),parameters:[s.workspaceId,marker]};
  const targetGuard=exactSet('tasks','workspaceId=? AND id IN (SELECT value FROM json_each(?))',[s.workspaceId,JSON.stringify(plan.before.map(t=>t.id))],plan.before,['id','version','projectId','archivedAt','deletedAt','deletedBy']);
  const refs=plan.changed.map(t=>relation(t,plan.replaceDependencies.includes(t.id)?plan.dependencies.filter(d=>d.taskId===t.id).map(d=>d.dependsOnTaskId):JSON.parse(plan.before.find(b=>b.id===t.id)!.visibleDependenciesJson) as string[])).concat(plan.created.map(t=>relation(t,plan.dependencies.filter(d=>d.taskId===t.id).map(d=>d.dependsOnTaskId),plan.children.filter(c=>c.taskId===t.id))));
  // Lifecycle commands may retain preexisting dependencies that have since been archived.
  const relationCheck=refs.length?await validateRelations(r,s,refs.map(t=>({...t,dependencyIds:plan.lifecycle?[]:t.dependencyIds}))):null;
  const accessGuard=plan.before.length?await validateRelations(r,s,plan.before.map(t=>relation(t,[]))):null;
  const guards=[targetGuard,...(accessGuard?[accessGuard]:[]),...plan.guards,...(relationCheck?[relationCheck]:[])];
  if(plan.request)guards.push({sql:'NOT EXISTS (SELECT 1 FROM tasks WHERE workspaceId=? AND createdBy=? AND createRequestId=?)',parameters:[s.workspaceId,s.memberId,plan.request.id]});
  const statements=[r.prepare(`UPDATE workspaces SET lastMutationId=? WHERE id=? AND ${actorSql()} AND ${guards.map(g=>`(${g.sql})`).join(' AND ')}`,[marker,s.workspaceId,...actorParameters(s),...guards.flatMap(g=>g.parameters)])];
  if(plan.allocations.length)statements.push(r.prepare(`UPDATE projects SET taskSequence=taskSequence+(SELECT json_extract(value,'$.count') FROM json_each(?) WHERE json_extract(value,'$.projectId')=projects.id) WHERE workspaceId=? AND id IN (SELECT json_extract(value,'$.projectId') FROM json_each(?)) AND ${gate.sql}`,[JSON.stringify(plan.allocations),s.workspaceId,JSON.stringify(plan.allocations),...gate.parameters]));
  if(plan.changed.length) {
    const json=JSON.stringify(plan.changed.map(t=>({...t,updatedAt:now,lastMutationId:marker})));
    const expression=(field:typeof fields[number])=>field==='number'?`CASE WHEN projectId != (SELECT json_extract(value,'$.projectId') FROM json_each(?) WHERE json_extract(value,'$.id')=tasks.id) THEN (SELECT p.taskSequence-(SELECT json_extract(value,'$.count') FROM json_each(?) WHERE json_extract(value,'$.projectId')=p.id)+(SELECT json_extract(value,'$.number') FROM json_each(?) WHERE json_extract(value,'$.id')=tasks.id) FROM projects p WHERE p.id=(SELECT json_extract(value,'$.projectId') FROM json_each(?) WHERE json_extract(value,'$.id')=tasks.id)) ELSE number END`:`(SELECT json_extract(value,'$.${field}') FROM json_each(?) WHERE json_extract(value,'$.id')=tasks.id)`;
    // number is allocated before projectId changes; SQLite RHS expressions see the old row.
    const cols=['number',...fields.filter(f=>f!=='number')] as (typeof fields[number])[];
    statements.push(r.prepare(`UPDATE tasks SET ${cols.map(f=>`${f}=${expression(f)}`).join(',')},version=version+1 WHERE workspaceId=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND ${gate.sql}`,[...cols.flatMap(f=>f==='number'?[json,JSON.stringify(plan.allocations),json,json]:[json]),s.workspaceId,json,...gate.parameters]));
  }
  const moves=plan.changed.filter(t=>plan.before.some(b=>b.id===t.id&&b.projectId!==t.projectId));if(moves.length)statements.push(r.prepare(`UPDATE files SET projectId=(SELECT json_extract(value,'$.projectId') FROM json_each(?) WHERE json_extract(value,'$.id')=files.taskId),version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND taskId IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND ${gate.sql}`,[JSON.stringify(moves),now,marker,s.workspaceId,JSON.stringify(moves),...gate.parameters]));
  if(plan.created.length) {
    const columns=[...fields,'id','workspaceId','recurrenceSourceTaskId','cancelledByUndoId','createdBy','createRequestId','createRequestHash','createdAt','version'],json=JSON.stringify(plan.created.map(t=>({...t,lastMutationId:marker})));
    statements.push(r.prepare(`INSERT INTO tasks(${columns.join(',')}) SELECT ${columns.map(c=>c==='number'?`p.taskSequence-(SELECT json_extract(value,'$.count') FROM json_each(?) WHERE json_extract(value,'$.projectId')=p.id)+json_extract(intent.value,'$.number')`:c==='position'?`(SELECT coalesce(max(position),-100) FROM tasks WHERE workspaceId=?)+100*(CAST(intent.key AS INTEGER)+1)`:`json_extract(intent.value,'$.${c}')`).join(',')} FROM json_each(?) intent JOIN projects p ON p.id=json_extract(intent.value,'$.projectId') AND p.workspaceId=? WHERE ${gate.sql}`,[JSON.stringify(plan.allocations),s.workspaceId,json,s.workspaceId,...gate.parameters]));
  }
  for(const [table,ids]of [['taskLabels',plan.replaceLabels],['taskDependencies',plan.replaceDependencies]] as const)if(ids.length)statements.push(r.prepare(`DELETE FROM ${table} WHERE workspaceId=? AND taskId IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,[s.workspaceId,JSON.stringify(ids),...gate.parameters]));
  for(const [table,rows]of [['subtasks',plan.children],['taskLabels',plan.labels],['taskDependencies',plan.dependencies]] as const)if(rows.length)statements.push(gatedInsert(r,table,rows,gate));
  const touched=[...new Set([...plan.created.flatMap(t=>plan.dependencies.filter(d=>d.taskId===t.id).map(d=>d.dependsOnTaskId)),...plan.replaceDependencies.flatMap(id=>changedDependencyTargets(dependencyIds(plan.before.find(t=>t.id===id)!) as EntityId[],plan.dependencies.filter(d=>d.taskId===id).map(d=>EntityIdSchema.parse(d.dependsOnTaskId))))])].filter(id=>!plan.changed.some(t=>t.id===id)&&!plan.created.some(t=>t.id===id));
  if(touched.length)statements.push(r.prepare(`UPDATE tasks SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,[now,marker,s.workspaceId,JSON.stringify(touched),...gate.parameters]));
  if(plan.events.length)statements.push(gatedInsert(r,'activity',plan.events.map(e=>({...e,commandId:marker})),gate));
  if(plan.undo)statements.push(gatedInsert(r,'commandUndoRecords',[{id:plan.undo.id,workspaceId:s.workspaceId,actorMemberId:s.memberId,kind:plan.undo.kind,payloadVersion:1,payloadJson:plan.undoPayload,createdAt:now,consumedAt:null,resultJson:null}],gate));
  const ids=[...plan.before.map(t=>t.id),...plan.created.map(t=>t.id),...touched];
  statements.push(r.prepare(`${taskSelect} WHERE t.workspaceId=? AND t.id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,[s.memberId,s.memberId,s.workspaceId,JSON.stringify(ids),...gate.parameters]));
  fitBatch(r,statements.length,plan.request?1:0);const results=await r.batch(statements);
  if(results[0]?.meta.changes!==1)return null;
  const rows=results.at(-1)!.results as TaskProjection[];
  return {tasks:plan.before.map(t=>taskDto(rows.find(row=>row.id===t.id)!)),createdTasks:plan.created.map(t=>taskDto(rows.find(row=>row.id===t.id)!)),affectedProjectIds:[...new Set([...plan.before,...plan.changed,...plan.created,...rows].map(t=>EntityIdSchema.parse(t.projectId)))],undo:plan.undo};
}
function conflict<T>(result:T|null):T {if(!result)throw new ApiFailure('CONFLICT','Task version, access, relations or command scope changed');return result;}
async function replay(r:RequestRepository,s:WorkspaceContext,requestId:string,hash:string,projectId:string) {
  const [old]=await r.all<TaskRow>('SELECT * FROM tasks WHERE workspaceId=? AND createdBy=? AND createRequestId=?',[s.workspaceId,s.memberId,requestId]);if(!old)return null;
  if(old.projectId!==projectId||old.createRequestHash!==hash||old.deletedAt!==null||old.archivedAt!==null)throw new ApiFailure('CONFLICT','Create request intent or task lifecycle changed');
  const row=await taskRow(r,s,EntityIdSchema.parse(old.id));if(row.projectId!==projectId||row.archivedAt!==null||row.deletedAt!==null)throw new ApiFailure('CONFLICT','Created task moved scope or lifecycle changed');return {task:taskDto(row),createdTasks:[],affectedProjectIds:[EntityIdSchema.parse(row.projectId)],undo:null};
}
export async function createTask(r:RequestRepository,s:WorkspaceContext,body:CreateTaskInput,now:number) {
  const description=sanitizeDescription(body.descriptionHtml),{clientRequestId,...intent}=body;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({...intent,descriptionHtml:description.html,labelIds:[...body.labelIds].sort(),dependencyIds:[...body.dependencyIds].sort()}))),hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
  const prior=await replay(r,s,clientRequestId,hash,body.projectId);if(prior)return {result:prior,replayed:true};
  const plan=empty(),task=baseTask(s,body,now);task.number=allocation(plan,task.projectId);task.createRequestHash=hash;plan.created=[task];plan.children=body.subtasks.map((c,i)=>({id:newId(),workspaceId:s.workspaceId,taskId:task.id,title:c.title,done:c.done,assigneeId:c.assigneeId,dueDate:c.dueDate,note:c.note,position:i*100,createdAt:now,updatedAt:now}));plan.labels=labelRows(s,task.id,body.labelIds);plan.dependencies=depRows(s,task.id,body.dependencyIds);plan.events=[event(s,task,now,'task.created')];plan.request={id:clientRequestId,hash};
  const result=await execute(r,s,plan,now);if(!result){const current=await replay(r,s,clientRequestId,hash,body.projectId);if(current)return {result:current,replayed:true};throw new ApiFailure('CONFLICT','Task create scope changed');}
  return {result:{task:result.createdTasks[0]!,createdTasks:[],affectedProjectIds:result.affectedProjectIds,undo:null},replayed:false};
}
export async function updateTask(r:RequestRepository,s:WorkspaceContext,id:EntityId,body:UpdateTaskInput,now:number,completion?:SetTaskCompletionInput) {
  const old=await taskRow(r,s,id);version(old,body.expectedVersion);active(old);
  const plan=empty();plan.before=[old];const {expectedVersion:_,labelIds:labels,dependencyIds:deps,...patch}=body;void _;
  if(completion&&completion.completed===(old.status==='done')){plan.guards.push(await validateRelations(r,s,[relation(old,[])]));const result=conflict(await execute(r,s,plan,now));return {task:result.tasks[0]!,createdTasks:[],affectedProjectIds:result.affectedProjectIds,undo:null};}
  let next:TaskRow=merge(transition(old,patch.status??old.status,now),patch);if(patch.descriptionHtml!==undefined){const description=sanitizeDescription(patch.descriptionHtml);next={...next,descriptionHtml:description.html,descriptionText:description.text};}
  if(next.startDate&&next.dueDate&&next.startDate>next.dueDate)throw new ApiFailure('VALIDATION_ERROR','startDate exceeds dueDate');
  plan.changed=[next];if(labels!==undefined){plan.replaceLabels=[id];plan.labels=labelRows(s,id,labels);}if(deps!==undefined){plan.replaceDependencies=[id];plan.dependencies=depRows(s,id,deps);}
  plan.events=[event(s,next,now,next.status==='done'&&old.status!=='done'?'task.completed':'task.updated')];await recurrence(r,s,old,next,plan,now);if(completion?.completed&&old.status!=='done')undoPlan(s,plan,'task.complete');
  const result=conflict(await execute(r,s,plan,now));return {task:result.tasks[0]!,createdTasks:result.createdTasks,affectedProjectIds:result.affectedProjectIds,undo:result.undo};
}
export async function completeTask(r:RequestRepository,s:WorkspaceContext,id:EntityId,body:SetTaskCompletionInput,now:number) {const old=await taskRow(r,s,id);return updateTask(r,s,id,{expectedVersion:body.expectedVersion,status:body.completed?'done':old.previousStatus&&old.previousStatus!=='done'?old.previousStatus as UpdateTaskInput['status']:'todo'},now,body);}
export async function lifecycleTask(r:RequestRepository,s:WorkspaceContext,id:EntityId,expectedVersion:number,operation:'archive'|'restore'|'delete'|'restore-deleted',now:number) {
  const old=await taskRow(r,s,id,operation==='restore-deleted');version(old,expectedVersion);
  if(operation==='archive'&&old.archivedAt!==null||operation==='restore'&&old.archivedAt===null||operation==='restore-deleted'&&(old.deletedAt===null||old.cancelledByUndoId!==null))throw new ApiFailure('CONFLICT','Task lifecycle changed');
  if(operation==='restore-deleted'&&old.deletedBy!==s.memberId)throw new ApiFailure('FORBIDDEN','Only deleting member can restore task');
  const plan=empty();plan.lifecycle=true;plan.before=[old];plan.changed=[{...old,archivedAt:operation==='archive'?now:operation==='restore'?null:old.archivedAt,deletedAt:operation==='delete'?now:operation==='restore-deleted'?null:old.deletedAt,deletedBy:operation==='delete'?s.memberId:operation==='restore-deleted'?null:old.deletedBy}];plan.events=[event(s,old,now,operation==='archive'?'task.archived':operation==='delete'?'task.deleted':'task.updated')];if(operation==='archive'||operation==='delete')undoPlan(s,plan,operation==='archive'?'task.archive':'task.delete');
  const result=conflict(await execute(r,s,plan,now));return {task:result.tasks[0]!,createdTasks:[],affectedProjectIds:result.affectedProjectIds,undo:result.undo};
}
export async function duplicateTask(r:RequestRepository,s:WorkspaceContext,id:EntityId,body:DuplicateTaskInput,now:number) {
  const old=await taskRow(r,s,id);version(old,body.expectedVersion);active(old);const plan=empty();plan.before=[old];
  const copy:TaskRow={...old,id:newId(),number:allocation(plan,old.projectId),title:body.title??`${old.title} (copy)`,status:'todo',completedAt:null,previousStatus:null,recurrenceSourceTaskId:null,cancelledByUndoId:null,createRequestId:null,createRequestHash:null,createdBy:s.memberId,createdAt:now,updatedAt:now,version:1,lastMutationId:null};plan.created=[copy];const children=await copiedChildren(r,s,old,plan,copy.id);plan.labels=labelRows(s,copy.id,labelIds(old));plan.dependencies=depRows(s,copy.id,visibleDependencies(old));plan.guards.push(await validateRelations(r,s,[relation(copy,visibleDependencies(old),children)]));plan.events=[event(s,copy,now,'task.created')];
  const result=conflict(await execute(r,s,plan,now));return {task:result.createdTasks[0]!,createdTasks:[],affectedProjectIds:result.affectedProjectIds,undo:null};
}
export async function moveTask(r:RequestRepository,s:WorkspaceContext,id:EntityId,body:MoveTaskInput,now:number) {
  const old=await taskRow(r,s,id);version(old,body.expectedVersion);active(old);const plan=empty();plan.before=[old];
  const dataset=await taskDataset(r,s,now);
  // Remove grouping fields before strict TaskQuery parsing.
  const {groupBy,groupKey,...queryInput}=body.scope;const destination=TaskQuerySchema.parse({...queryInput,...(body.targetProjectId?{projectId:body.targetProjectId}:{})});
  const next=merge(transition(old,body.groupPatch?.status??old.status,now),{...body.groupPatch,projectId:body.targetProjectId??old.projectId});
  next.completedAt=transition(old,body.groupPatch?.status??old.status,now).completedAt;next.previousStatus=transition(old,body.groupPatch?.status??old.status,now).previousStatus;
  const projected=merge(taskDto(old),{...body.groupPatch,projectId:EntityIdSchema.parse(next.projectId),status:next.status as import('@studio/contracts/api').TaskStatus,completedAt:nullableInstant(next.completedAt)});
  if(!filterTasks([projected],destination,dataset.env).length)throw new ApiFailure('VALIDATION_ERROR','Task does not match destination scope');
  const candidates=filterTasks(dataset.items,destination,dataset.env).filter(t=>t.id!==id),group=groupBy&&groupBy!=='none'?groupTasks([...candidates,projected],groupBy,dataset.env).find(g=>g.key===(groupKey===null?'none':groupKey)):null;
  if(groupBy&&groupBy!=='none'&&(!group||!group.taskIds.includes(id)))throw new ApiFailure('VALIDATION_ERROR','Invalid destination group');
  const ids=group?new Set(group.taskIds):null,neighbors=candidates.filter(t=>!ids||ids.has(t.id)).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
  let at=neighbors.length;if(body.beforeId){at=neighbors.findIndex(t=>t.id===body.beforeId);if(at<0)throw new ApiFailure('VALIDATION_ERROR','Invalid before neighbor');}if(body.afterId){const ai=neighbors.findIndex(t=>t.id===body.afterId);if(ai<0||body.beforeId&&ai+1!==at)throw new ApiFailure('VALIDATION_ERROR','Invalid adjacent neighbors');at=ai+1;}
  const lower=neighbors[at-1]?.position,upper=neighbors[at]?.position;next.position=lower===undefined?upper===undefined?0:upper-100:upper===undefined?lower+100:Math.floor((lower+upper)/2);
  if(!Number.isSafeInteger(next.position)||lower!==undefined&&upper!==undefined&&next.position<=lower) {
    if(neighbors.length+1>128)throw new ApiFailure('VIEW_SCOPE_TOO_LARGE','Ordering scope exceeds bounded rebalance');const order=[...neighbors];order.splice(at,0,projected);const base=neighbors.length?Math.min(...neighbors.map(t=>t.position)):0;
    for(const [index,t]of order.entries()){const position=base+index*100;if(!Number.isSafeInteger(position))throw new ApiFailure('VIEW_SCOPE_TOO_LARGE','Ordering exceeds integer range');if(t.id===id){next.position=position;continue;}const oldNeighbor=dataset.rows.find(r=>r.id===t.id)!;if(oldNeighbor.position!==position){plan.before.push(oldNeighbor);plan.changed.push({...oldNeighbor,position});}}
  }
  plan.guards.push(exactSet('tasks','workspaceId=? AND id IN (SELECT value FROM json_each(?))',[s.workspaceId,JSON.stringify(neighbors.map(t=>t.id))],neighbors,['id','version','position','projectId','status','priority','assigneeId']));
  // Exact authorized scope blocks a new/changed neighbor between read and batch.
  plan.guards.push(exactSet('tasks',`workspaceId=? AND deletedAt IS NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND (p.visibility='workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=?)))`,[s.workspaceId,s.memberId],dataset.rows,['id','version','position','projectId','archivedAt','deletedAt']));
  if(next.projectId!==old.projectId)next.number=allocation(plan,next.projectId);plan.changed.push(next);plan.events=[event(s,next,now,'task.moved')];await recurrence(r,s,old,next,plan,now);
  const result=conflict(await execute(r,s,plan,now));return {task:result.tasks.find(t=>t.id===id)!,createdTasks:result.createdTasks,affectedProjectIds:result.affectedProjectIds,undo:null};
}
export async function bulkTasks(r:RequestRepository,s:WorkspaceContext,body:BulkMutateTasksInput,now:number) {
  const dataset=await taskDataset(r,s,now),plan=empty(),ids=body.items.map(t=>t.id);
  for(const item of body.items){const row=dataset.rows.find(t=>t.id===item.id);if(!row)throw new ApiFailure('NOT_FOUND','Task not found');version(row,item.expectedVersion);active(row);plan.before.push(row);}
  if('columnScope' in body) {
    const column=body.columnScope;if(column.kind==='project')plan.guards.push(await validateRelations(r,s,[{id:newId(),projectId:column.projectId,assigneeId:null,dependencyIds:[],subtaskAssigneeIds:[]}]));const matches=dataset.rows.filter(t=>t.archivedAt===null&&t.status===column.status&&(column.kind==='workspace'||t.projectId===column.projectId));
    if(matches.length>20)throw new ApiFailure('PAYLOAD_TOO_LARGE','Column exceeds maxBulkItems');
    if(matches.length!==ids.length||matches.some(t=>!ids.includes(EntityIdSchema.parse(t.id))))throw new ApiFailure('CONFLICT','Column ID/version set changed');
    const where=`workspaceId=? AND archivedAt IS NULL AND deletedAt IS NULL AND status=? ${column.kind==='project'?'AND projectId=?':''} AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND (p.visibility='workspace' OR EXISTS (SELECT 1 FROM projectMembers pm WHERE pm.workspaceId=p.workspaceId AND pm.projectId=p.id AND pm.memberId=?)))`;
    plan.guards.push(exactSet('tasks',where,[s.workspaceId,column.status,...(column.kind==='project'?[column.projectId]:[]),s.memberId],matches,['id','version']));
  }
  if(body.operation==='patch'||body.operation==='complete') {
    const idsJson=JSON.stringify(ids),where='workspaceId=? AND taskId IN (SELECT value FROM json_each(?))';
    plan.sourceChildren=await r.all<SubtaskRow>(`SELECT * FROM subtasks WHERE ${where}`,[s.workspaceId,idsJson]);plan.slots=await r.all<TaskRow>('SELECT * FROM tasks WHERE workspaceId=? AND recurrenceSourceTaskId IN (SELECT value FROM json_each(?))',[s.workspaceId,idsJson]);
    plan.guards.push(exactSet('subtasks',where,[s.workspaceId,idsJson],plan.sourceChildren,['id','taskId','title','done','assigneeId','dueDate','note','position','createdAt','updatedAt']),exactSet('tasks','workspaceId=? AND recurrenceSourceTaskId IN (SELECT value FROM json_each(?))',[s.workspaceId,idsJson],plan.slots,['id','version','recurrenceSourceTaskId']));
  }
  if(body.operation==='delete'||body.operation==='archive')plan.lifecycle=true;
  const sorted=[...plan.before].sort((a,b)=>priorities.find(p=>p.id===b.priority)!.weight-priorities.find(p=>p.id===a.priority)!.weight||a.id.localeCompare(b.id)),base=Math.min(...plan.before.map(t=>t.position));
  for(const old of plan.before) {
    let next:TaskRow={...old};
    if(body.operation==='patch') {next=merge(next,body.patch);if(next.startDate&&next.dueDate&&next.startDate>next.dueDate)throw new ApiFailure('VALIDATION_ERROR','startDate exceeds dueDate');if(body.patch.status!==undefined)next={...next,completedAt:transition(old,body.patch.status,now).completedAt,previousStatus:transition(old,body.patch.status,now).previousStatus};}
    else if(body.operation==='complete') {if(old.status==='done')continue;next=transition(old,'done',now);}
    else if(body.operation==='archive')next.archivedAt=now;
    else if(body.operation==='delete'){next.deletedAt=now;next.deletedBy=s.memberId;}
    else next.position=base+sorted.findIndex(t=>t.id===old.id)*100;
    plan.changed.push(next);if(body.operation!=='sortPriority')plan.events.push(event(s,next,now,body.operation==='delete'?'task.deleted':body.operation==='archive'?'task.archived':next.status==='done'&&old.status!=='done'?'task.completed':'task.updated'));
    if(body.operation==='patch'||body.operation==='complete')await recurrence(r,s,old,next,plan,now);
  }
  if(body.operation==='delete')undoPlan(s,plan,'tasks.bulkDelete');else if(body.operation==='archive')undoPlan(s,plan,'tasks.archiveCompletedColumn');else if(body.operation==='complete'&&plan.changed.length)undoPlan(s,plan,'tasks.completeColumn',true);
  return conflict(await execute(r,s,plan,now));
}
export async function favoriteTask(r:RequestRepository,s:WorkspaceContext,id:EntityId,favorite:boolean,now:number) {
  const old=await taskRow(r,s,id);active(old);
  const marker=newId(),guard=await validateRelations(r,s,[relation(old,[])]),gate={sql:markerSql('workspaces'),parameters:[s.workspaceId,marker]};
  const statements=[r.prepare(`UPDATE workspaces SET lastMutationId=? WHERE id=? AND ${actorSql()} AND EXISTS (SELECT 1 FROM tasks WHERE workspaceId=? AND id=? AND version=? AND archivedAt IS NULL AND deletedAt IS NULL) AND ${guard.sql}`,[marker,s.workspaceId,...actorParameters(s),s.workspaceId,id,old.version,...guard.parameters])];
  // Bump aggregate version only for an actual favorite change. Idempotent retries stay stable.
  statements.push(r.prepare(`UPDATE tasks SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND id=? AND ${favorite?'NOT ':''}EXISTS (SELECT 1 FROM taskFavorites WHERE workspaceId=? AND memberId=? AND taskId=?) AND ${gate.sql}`,[now,marker,s.workspaceId,id,s.workspaceId,s.memberId,id,...gate.parameters]));
  if(favorite)statements.push(r.prepare(`INSERT OR IGNORE INTO taskFavorites(workspaceId,memberId,taskId,createdAt) SELECT ?,?,?,? WHERE ${gate.sql}`,[s.workspaceId,s.memberId,id,now,...gate.parameters]));
  else statements.push(r.prepare(`DELETE FROM taskFavorites WHERE workspaceId=? AND memberId=? AND taskId=? AND ${gate.sql}`,[s.workspaceId,s.memberId,id,...gate.parameters]));
  statements.push(r.prepare(`${taskSelect} WHERE t.workspaceId=? AND t.id=? AND ${gate.sql}`,[s.memberId,s.memberId,s.workspaceId,id,...gate.parameters]));
  fitBatch(r,statements.length,0);const results=await r.batch(statements);if(results[0]?.meta.changes!==1)throw new ApiFailure('CONFLICT','Favorite task changed');return {taskId:id,isFavorite:favorite};
}
