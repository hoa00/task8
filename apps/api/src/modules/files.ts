import { EntityIdSchema, FileSchema } from '@studio/contracts/api';
import { displayFileSize, sourceFileType } from '@studio/domain';
import { accessSql } from '../db/guards.ts';
import { gatedInsert } from '../db/commands.ts';
import { ApiFailure } from '../errors.ts';
import { projectRow, writeAccessSql } from './read-model.ts';
import { actorParameters, actorSql, fitBatch, instant, newId } from './shared.ts';
import { projectionPage } from './projection-page.ts';
import { decodeUndoPayload, decodeUndoResult, encodeUndoPayload, encodeUndoResult } from '../db/undo.ts';
import type { EntityId, UploadProjectFileInput, FileQuerySchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
import type { SqlPredicate } from '../db/commands.ts';
import type { files, commandUndoRecords } from '../db/schema.ts';
export type FileRow = typeof files.$inferSelect;
export const fileDto = (f:FileRow) => FileSchema.parse({id:f.id,workspaceId:f.workspaceId,projectId:f.projectId,taskId:f.taskId,name:f.name,fileType:f.fileType,mimeType:f.mimeType,sizeBytes:f.sizeBytes,displaySize:f.displaySize,storageMode:f.storageMode,contentAvailable:f.storageMode==='r2',createdBy:f.createdBy,createdAt:instant(f.createdAt),version:f.version});
const invalidName=(name:string)=>[...name].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127||c==='/'||c==='\\');
export const safeInline = (mime:string) => ['image/png','image/jpeg','image/gif','image/webp'].includes(mime);
export async function fileRow(r:RequestRepository,s:WorkspaceContext,id:EntityId,deleted=false) {
  const [f]=await r.all<FileRow>(`SELECT f.* FROM files f JOIN projects p ON p.workspaceId=f.workspaceId AND p.id=f.projectId WHERE f.workspaceId=? AND f.id=? ${deleted?'':'AND f.deletedAt IS NULL'} AND p.deletedAt IS NULL AND p.archivedAt IS NULL AND ${accessSql} AND (f.taskId IS NULL OR EXISTS (SELECT 1 FROM tasks t WHERE t.workspaceId=f.workspaceId AND t.id=f.taskId AND t.projectId=f.projectId AND t.deletedAt IS NULL AND t.archivedAt IS NULL))`,[s.workspaceId,id,s.memberId]);
  if(!f)throw new ApiFailure('NOT_FOUND','File not found');return f;
}
async function parent(r:RequestRepository,s:WorkspaceContext,projectId:string,taskId:string|null,write=true) {
  const p=await projectRow(r,s,EntityIdSchema.parse(projectId),true,false,write);
  if(p.archivedAt!==null)throw new ApiFailure('CONFLICT','Restore project first');
  if(taskId===null)return {table:'projects' as const,id:p.id,version:p.version};
  const [t]=await r.all<{id:string;version:number}>('SELECT id,version FROM tasks WHERE workspaceId=? AND id=? AND projectId=? AND archivedAt IS NULL AND deletedAt IS NULL',[s.workspaceId,taskId,projectId]);
  if(!t)throw new ApiFailure('NOT_FOUND','Attachment task not found');return {table:'tasks' as const,...t};
}
function rootGate(r:RequestRepository,s:WorkspaceContext,p:Awaited<ReturnType<typeof parent>>,projectId:string,marker:string,now:number,guards:SqlPredicate[],cas:number|null) {
  const scope=p.table==='projects'?`id=? AND archivedAt IS NULL AND deletedAt IS NULL AND ${writeAccessSql.replaceAll('p.','projects.')}`:`id=? AND projectId=? AND archivedAt IS NULL AND deletedAt IS NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=tasks.workspaceId AND p.id=tasks.projectId AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${writeAccessSql})`;
  const root=r.prepare(`UPDATE ${p.table} SET version=version+1,updatedAt=?,lastMutationId=? WHERE workspaceId=? AND ${scope} ${cas===null?'':'AND version=?'} AND ${actorSql()} ${guards.map(g=>`AND (${g.sql})`).join(' ')}`,[now,marker,s.workspaceId,p.id,...(p.table==='tasks'?[projectId]:[]),s.memberId,...(cas===null?[]:[cas]),...actorParameters(s),...guards.flatMap(g=>g.parameters)]);
  return {root,gate:{sql:`EXISTS (SELECT 1 FROM ${p.table} gate WHERE gate.workspaceId=? AND gate.id=? AND gate.lastMutationId=?)`,parameters:[s.workspaceId,p.id,marker]}};
}
export async function listFiles(r:RequestRepository,s:WorkspaceContext,id:EntityId,q:ReturnType<typeof FileQuerySchema.parse>) {
  await parent(r,s,id,null,false);
  const rows=await r.all<FileRow>(`SELECT f.* FROM files f WHERE f.workspaceId=? AND f.projectId=? AND f.deletedAt IS NULL AND (f.taskId IS NULL OR EXISTS (SELECT 1 FROM tasks t WHERE t.workspaceId=f.workspaceId AND t.id=f.taskId AND t.projectId=f.projectId AND t.deletedAt IS NULL AND t.archivedAt IS NULL))`,[s.workspaceId,id]);
  const selected=rows.filter(f=>(!q.q||f.name.toLowerCase().includes(q.q.toLowerCase()))&&(!q.type||f.fileType===q.type));
  const value=(f:FileRow)=>q.sort==='recent'?-f.createdAt:q.sort==='size'?-(f.sizeBytes??-1):q.sort==='type'?f.fileType:f.name;
  selected.sort((a,b)=>{const av=value(a),bv=value(b);return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv)))||a.id.localeCompare(b.id);});
  const page=await projectionPage(selected,q,{scope:s,kind:'files',projectId:id,...q,cursor:undefined,limit:undefined},value);return {...page,items:page.items.map(fileDto)};
}
async function digest(bytes:Uint8Array) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function validateBytes(file:UploadProjectFileInput['file']) {
  if(file.bytes.byteLength>10485760)throw new ApiFailure('PAYLOAD_TOO_LARGE','File exceeds 10 MiB');
  if(invalidName(file.name)||!/^[-\w.+]+\/[-\w.+]+$/u.test(file.mimeType))throw new ApiFailure('VALIDATION_ERROR','Invalid file name or media type');
  const b=file.bytes,m=file.mimeType.toLowerCase();
  if(m==='image/png'&&![137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)||m==='image/jpeg'&&!(b[0]===255&&b[1]===216&&b[2]===255)||m==='image/gif'&&!['GIF87a','GIF89a'].includes(new TextDecoder().decode(b.slice(0,6)))||m==='image/webp'&&!(new TextDecoder().decode(b.slice(0,4))==='RIFF'&&new TextDecoder().decode(b.slice(8,12))==='WEBP'))throw new ApiFailure('VALIDATION_ERROR','File bytes do not match the preview media type');
}
async function available(bucket:R2Bucket,f:FileRow) {if(f.storageMode==='r2'&&(!f.objectKey||!await bucket.head(f.objectKey)))throw new ApiFailure('INTERNAL_ERROR','File bytes are unavailable; retry the same intent');}
// Native SQL execution failures reject the entire D1 batch. Transport/timeouts do
// not establish rollback; even a negative read cannot authorize deletion then.
const confirmedRollback=(error:unknown)=>error instanceof Error&&/D1_ERROR:/u.test(error.message)&&/constraint failed|SQLITE_CONSTRAINT|no such table|syntax error/iu.test(error.message);
async function cleanup(bucket:R2Bucket,f:FileRow) {try{await bucket.delete(f.objectKey!);}catch(error){console.error('File compensation unresolved',JSON.stringify({fileId:f.id,objectKey:f.objectKey,requestId:f.uploadRequestId}),error instanceof Error?error.name:'Error');throw new ApiFailure('INTERNAL_ERROR','File cleanup is unconfirmed; retry the same intent');}}
async function intent(r:RequestRepository,s:WorkspaceContext,key:string) {return (await r.all<FileRow & {actorValid:number}>(`SELECT f.*,${actorSql()} actorValid FROM files f WHERE workspaceId=? AND createdBy=? AND uploadRequestId=?`,[...actorParameters(s),s.workspaceId,s.memberId,key]))[0];}
async function currentActor(r:RequestRepository,s:WorkspaceContext){const [valid]=await r.all<{valid:number}>(`SELECT ${actorSql()} valid`,actorParameters(s));if(!valid?.valid)throw new ApiFailure('CONFLICT','Upload actor authorization changed');}
async function replay(r:RequestRepository,s:WorkspaceContext,bucket:R2Bucket,f:FileRow & {actorValid?:number},hash:string) {if(f.actorValid===0)throw new ApiFailure('CONFLICT','Upload actor authorization changed');await currentActor(r,s);if(f.uploadRequestHash!==hash)throw new ApiFailure('CONFLICT','Upload intent payload changed');const current=await fileRow(r,s,EntityIdSchema.parse(f.id));await parent(r,s,current.projectId,current.taskId);await available(bucket,current);return fileDto(current);}
export async function uploadFile(r:RequestRepository,s:WorkspaceContext,bucket:R2Bucket,projectId:EntityId,input:UploadProjectFileInput,now:number) {
  const p=await parent(r,s,projectId,input.taskId??null);validateBytes(input.file);
  const mime=input.file.mimeType.toLowerCase(),contentSha256=await digest(input.file.bytes),requestHash=await digest(new TextEncoder().encode(JSON.stringify({projectId,taskId:input.taskId??null,name:input.file.name.trim(),mime,actualSize:input.file.bytes.byteLength,contentSha256})));
  const existing=await intent(r,s,input.clientRequestId);if(existing)return {file:await replay(r,s,bucket,existing,requestHash),created:false};
  const id=newId(),marker=newId(),f:FileRow={id,workspaceId:s.workspaceId,projectId,taskId:input.taskId??null,name:input.file.name.trim(),fileType:sourceFileType(input.file.name),mimeType:mime,sizeBytes:input.file.bytes.byteLength,displaySize:displayFileSize(input.file.bytes.byteLength),storageMode:'r2',objectKey:`workspaces/${s.workspaceId}/projects/${projectId}/files/${id}`,contentSha256,uploadRequestId:input.clientRequestId,uploadRequestHash:requestHash,createdBy:s.memberId,createdAt:now,updatedAt:now,deletedAt:null,deletedBy:null,version:1,lastMutationId:marker};
  const unique={sql:'NOT EXISTS (SELECT 1 FROM files WHERE workspaceId=? AND createdBy=? AND uploadRequestId=?)',parameters:[s.workspaceId,s.memberId,input.clientRequestId]};
  const {root,gate}=rootGate(r,s,p,projectId,marker,now,[unique],null),statements=[root,gatedInsert(r,'files',[f],gate),gatedInsert(r,'activity',[{id:newId(),workspaceId:s.workspaceId,projectId,taskId:f.taskId,actorId:s.memberId,eventType:'file.created',payloadJson:JSON.stringify({fileName:f.name}),commandId:marker,revertedAt:null,createdAt:now}],gate),r.prepare(`SELECT f.*,${actorSql()} actorValid FROM files f WHERE workspaceId=? AND createdBy=? AND uploadRequestId=?`,[...actorParameters(s),s.workspaceId,s.memberId,input.clientRequestId])];
  fitBatch(r,statements.length,5);
  try{await bucket.put(f.objectKey!,input.file.bytes,{httpMetadata:{contentType:mime},customMetadata:{contentSha256,requestId:input.clientRequestId}});}catch{console.error('File object write unresolved',JSON.stringify({fileId:id,objectKey:f.objectKey,requestId:input.clientRequestId}));throw new ApiFailure('INTERNAL_ERROR','File bytes could not be confirmed; retry the same intent');}
  let winner:(FileRow & {actorValid:number})|undefined;
  try {const result=await r.batch(statements);winner=result.at(-1)!.results[0] as (FileRow & {actorValid:number})|undefined;}
  catch(error) {
    try{winner=await intent(r,s,input.clientRequestId);}catch{/* Unknown acknowledgement and failed verification preserve owned bytes. */}
    if(winner?.objectKey===f.objectKey)return {file:await replay(r,s,bucket,winner,requestHash),created:false};
    if(winner){await cleanup(bucket,f);return {file:await replay(r,s,bucket,winner,requestHash),created:false};}
    if(confirmedRollback(error)){await cleanup(bucket,f);throw error;}
    console.error('File commit unresolved',JSON.stringify({fileId:id,objectKey:f.objectKey,requestId:input.clientRequestId,requestHash}));
    throw new ApiFailure('INTERNAL_ERROR','Upload outcome is unconfirmed; retry the same intent');
  }
  if(!winner){await cleanup(bucket,f);throw new ApiFailure('CONFLICT','Upload scope changed');}
  if(winner.objectKey!==f.objectKey){await cleanup(bucket,f);return {file:await replay(r,s,bucket,winner,requestHash),created:false};}
  return {file:await replay(r,s,bucket,winner,requestHash),created:true};
}
export async function changeFile(r:RequestRepository,s:WorkspaceContext,bucket:R2Bucket,id:EntityId,expectedVersion:number,operation:'rename'|'delete'|'restore'|'duplicate',name:string|undefined,now:number) {
  const old=await fileRow(r,s,id,operation==='restore'),p=await parent(r,s,old.projectId,old.taskId);
  if(old.version!==expectedVersion||operation==='restore'&&(old.deletedAt===null||old.deletedBy!==s.memberId))throw new ApiFailure('CONFLICT','File version or lifecycle changed');
  if(operation==='restore'||operation==='duplicate')await available(bucket,old);
  if(name!==undefined&&invalidName(name))throw new ApiFailure('VALIDATION_ERROR','Invalid file name');
  const marker=newId(),copyId=operation==='duplicate'?newId():id;
  const row={...old,id:copyId,name:name??(operation==='duplicate'?old.name.replace(/(\.[^.]+)$/u,' copy$1'):old.name),updatedAt:now,version:operation==='duplicate'?1:old.version+1,lastMutationId:marker,deletedAt:operation==='delete'?now:null,deletedBy:operation==='delete'?s.memberId:null,...(operation==='duplicate'?{createdAt:now,createdBy:s.memberId,uploadRequestId:null,uploadRequestHash:null,objectKey:old.storageMode==='r2'?`workspaces/${s.workspaceId}/projects/${old.projectId}/files/${copyId}`:null}:{})};
  row.fileType=sourceFileType(row.name);
  fileDto(row);
  const guard={sql:'EXISTS (SELECT 1 FROM files WHERE workspaceId=? AND id=? AND projectId=? AND taskId IS ? AND version=? AND deletedAt IS ? AND deletedBy IS ?)',parameters:[s.workspaceId,id,old.projectId,old.taskId,old.version,old.deletedAt,old.deletedBy]};
  const {root,gate}=rootGate(r,s,p,old.projectId,marker,now,[guard],p.version),eventId=newId(),undo=operation==='delete'?{id:newId(),kind:'file.delete' as const}:null;
  const payload=undo?encodeUndoPayload({kind:'file.delete',targets:[{id,postVersion:row.version,projectId:old.projectId,taskId:old.taskId,parentPostVersion:p.version+1,before:{archivedAt:null,deletedAt:old.deletedAt,deletedBy:old.deletedBy,updatedAt:instant(old.updatedAt)}}],activityIds:[eventId]}):null;
  const statements=[root,operation==='duplicate'?gatedInsert(r,'files',[row],gate):r.prepare(`UPDATE files SET name=?,fileType=?,version=version+1,updatedAt=?,deletedAt=?,deletedBy=?,lastMutationId=? WHERE workspaceId=? AND id=? AND ${gate.sql}`,[row.name,row.fileType,now,row.deletedAt,row.deletedBy,marker,s.workspaceId,id,...gate.parameters]),gatedInsert(r,'activity',[{id:eventId,workspaceId:s.workspaceId,projectId:old.projectId,taskId:old.taskId,actorId:s.memberId,eventType:operation==='delete'?'file.deleted':operation==='duplicate'?'file.created':'file.updated',payloadJson:JSON.stringify({fileName:row.name}),commandId:marker,revertedAt:null,createdAt:now}],gate)];
  if(undo)statements.push(r.prepare(`INSERT INTO commandUndoRecords(id,workspaceId,actorMemberId,kind,payloadVersion,payloadJson,createdAt,consumedAt,resultJson) SELECT ?,?,?,?,1,json_set(?,'$.targets[0].postVersion',(SELECT version FROM files WHERE workspaceId=? AND id=?),'$.targets[0].parentPostVersion',(SELECT version FROM ${p.table} WHERE workspaceId=? AND id=?)),?,NULL,NULL WHERE ${gate.sql}`,[undo.id,s.workspaceId,s.memberId,undo.kind,payload!,s.workspaceId,id,s.workspaceId,p.id,now,...gate.parameters]));
  statements.push(r.prepare(`SELECT * FROM files WHERE workspaceId=? AND id=? AND ${gate.sql}`,[s.workspaceId,copyId,...gate.parameters]));fitBatch(r,statements.length,2);
  const unresolved=()=>console.error('File duplicate unresolved',JSON.stringify({fileId:copyId,objectKey:row.objectKey,sourceFileId:id}));
  if(operation==='duplicate'&&old.storageMode==='r2'){
    try{const content=await bucket.get(old.objectKey!);if(!content)throw new ApiFailure('NOT_FOUND','File content missing');await bucket.put(row.objectKey!,content.body,{httpMetadata:{contentType:old.mimeType!},customMetadata:{contentSha256:old.contentSha256!}});}
    catch{unresolved();throw new ApiFailure('INTERNAL_ERROR','Duplicate bytes are unconfirmed; inspect the recorded copy intent');}
  }
  let results:D1Result[];
  try{results=await r.batch(statements);}
  catch(error){
    if(operation!=='duplicate'||row.storageMode!=='r2')throw error;
    if(confirmedRollback(error)){await cleanup(bucket,row);throw error;}
    let committed:FileRow|undefined;
    try{[committed]=await r.all<FileRow>('SELECT * FROM files WHERE workspaceId=? AND id=?',[s.workspaceId,copyId]);}catch{/* An unknown read cannot authorize cleanup. */}
    if(committed?.objectKey===row.objectKey){await currentActor(r,s);const current=await fileRow(r,s,copyId);await available(bucket,current);return {file:fileDto(current),undo:null};}
    unresolved();throw new ApiFailure('INTERNAL_ERROR','Duplicate outcome is unconfirmed; inspect the recorded copy intent');
  }
  if(results[0]?.meta.changes!==1){if(operation==='duplicate'&&row.storageMode==='r2')await cleanup(bucket,row);throw new ApiFailure('CONFLICT','File or parent changed');}
  return {file:fileDto(row),undo};
}
export async function undoFile(r:RequestRepository,s:WorkspaceContext,record:typeof commandUndoRecords.$inferSelect,now:number,bucket:R2Bucket) {
  const payload=decodeUndoPayload(record.payloadJson);if(payload.kind!=='file.delete')throw new ApiFailure('INTERNAL_ERROR','Invalid file Undo');
  const t=payload.targets[0]!,[old]=await r.all<FileRow>('SELECT * FROM files WHERE workspaceId=? AND id=?',[s.workspaceId,t.id]);
  if(!old)throw new ApiFailure('NOT_FOUND','File not found');
  if(old.projectId!==t.projectId||old.taskId!==t.taskId)throw new ApiFailure('CONFLICT','File association changed');
  async function currentParent() {
    const [current]=await r.all<FileRow>('SELECT * FROM files WHERE workspaceId=? AND id=?',[s.workspaceId,t.id]);
    if(!current)throw new ApiFailure('NOT_FOUND','File not found');
    if(current.projectId!==t.projectId||current.taskId!==t.taskId)throw new ApiFailure('CONFLICT','File association changed');
    const project=await projectRow(r,s,EntityIdSchema.parse(current.projectId),false,true,true);
    if(project.archivedAt!==null||project.deletedAt!==null)throw new ApiFailure('CONFLICT','Undo parent lifecycle changed');
    if(current.taskId){const [task]=await r.all<{id:string;projectId:string;version:number;archivedAt:number|null;deletedAt:number|null}>('SELECT id,projectId,version,archivedAt,deletedAt FROM tasks WHERE workspaceId=? AND id=?',[s.workspaceId,current.taskId]);if(!task||task.projectId!==current.projectId||task.archivedAt!==null||task.deletedAt!==null)throw new ApiFailure('CONFLICT','Undo task lifecycle or association changed');return {table:'tasks' as const,id:task.id,version:task.version};}
    return {table:'projects' as const,id:project.id,version:project.version};
  }
  const p=await currentParent();
  if(record.resultJson!==null){await currentActor(r,s);return decodeUndoResult(record.resultJson);}
  await available(bucket,old);
  const marker=newId(),guard={sql:'EXISTS (SELECT 1 FROM files WHERE workspaceId=? AND id=? AND version=? AND deletedAt=? AND deletedBy=?) AND EXISTS (SELECT 1 FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=? AND consumedAt IS NULL)',parameters:[s.workspaceId,t.id,t.postVersion,record.createdAt,s.memberId,s.workspaceId,record.id,s.memberId]};
  const {root,gate}=rootGate(r,s,p,old.projectId,marker,now,[guard],t.parentPostVersion),result=encodeUndoResult({undoId:record.id,kind:'file.delete',appliedAt:instant(now),affected:{taskIds:old.taskId?[old.taskId]:[],projectIds:[old.projectId],teamIds:[],memberIds:[],commentIds:[],fileIds:[old.id]}});
  const statements=[root,r.prepare(`UPDATE files SET deletedAt=NULL,deletedBy=NULL,updatedAt=?,version=version+1,lastMutationId=? WHERE workspaceId=? AND id=? AND ${gate.sql}`,[now,marker,s.workspaceId,old.id,...gate.parameters]),r.prepare(`UPDATE activity SET revertedAt=? WHERE workspaceId=? AND id IN (SELECT value FROM json_each(?)) AND ${gate.sql}`,[now,s.workspaceId,JSON.stringify(payload.activityIds),...gate.parameters]),r.prepare(`UPDATE commandUndoRecords SET consumedAt=?,resultJson=? WHERE workspaceId=? AND id=? AND consumedAt IS NULL AND ${gate.sql}`,[now,result,s.workspaceId,record.id,...gate.parameters]),r.prepare(`SELECT ${actorSql()} actorValid,EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=? AND p.id=? AND p.archivedAt IS NULL AND p.deletedAt IS NULL AND ${writeAccessSql}) projectValid`,[...actorParameters(s),s.workspaceId,old.projectId,s.memberId])];fitBatch(r,statements.length,5);
  const results=await r.batch(statements);if(results[0]?.meta.changes!==1){const auth=results.at(-1)?.results[0] as {actorValid:number;projectValid:number}|undefined;if(!auth?.actorValid)throw new ApiFailure('CONFLICT','File Undo actor authorization changed');await currentActor(r,s);await currentParent();if(!auth.projectValid)throw new ApiFailure('FORBIDDEN','File Undo project authorization changed');const [latest]=await r.all<{resultJson:string|null}>('SELECT resultJson FROM commandUndoRecords WHERE workspaceId=? AND id=? AND actorMemberId=?',[s.workspaceId,record.id,s.memberId]);if(latest?.resultJson)return decodeUndoResult(latest.resultJson);throw new ApiFailure('CONFLICT','File Undo targets changed');}return decodeUndoResult(result);
}
