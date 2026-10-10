// Test-only Wrangler entry; never imported by production src/index.ts.
import app from '../../src/index.ts';
import { RequestRepository } from '../../src/db/repository.ts';
import { taskMarkerParameters, taskMarkerSql, taskVersionGate, requireMatchedVersion } from '../../src/db/guards.ts';
import { encodeUndoPayload, decodeUndoPayload, encodeUndoResult, decodeUndoResult } from '../../src/db/undo.ts';
import { EntityIdSchema, sourceId } from '@studio/contracts';
import type { WorkspaceContext } from '../../src/db/repository.ts';
const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
const wid=sourceId('workspaces','w1'),taskId=sourceId('tasks','t1'),actor=sourceId('members','m1'),otherProject=sourceId('projects','p6');
const scope:WorkspaceContext={workspaceId:wid,memberId:actor};
const id=(last:string)=>EntityIdSchema.parse('01a11abd-aa80-7000-8000-'+last.padStart(12,'0'));
export default {async fetch(request:Request,env:CloudflareBindings,context:ExecutionContext) {
  const path=new URL(request.url).pathname;
  if(path==='/__verify/snapshot') {
    const tables=['users','workspaces','workspaceMembers','teams','projects','projectMembers','tasks','subtasks','taskLabels','taskDependencies','comments','commentReactions','activity','notifications','savedViews','taskFavorites','projectFavorites','memberProjectOrder','memberPreferences','files','calendarEvents','projectMilestones','commandUndoRecords','d1_migrations'];
    const rows:Record<string,unknown>={};for(const table of tables)rows[table]=(await env.DB.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()).results;
    return Response.json({now:Date.now(),rows,tableNames:(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all<{name:string}>()).results.map(row=>row.name)});
  }
  if(path==='/__verify/error') return app.fetch(new Request(new URL('/api/v1/session',request.url)),{...env,DB:{prepare(){throw new Error('secret db details');}} as unknown as D1Database},context);
  if(path==='/__verify/guards') {
    const passed:string[]=[];const repository=new RequestRepository(env.DB);
    const before=await env.DB.prepare('SELECT * FROM tasks WHERE id=?').bind(taskId).first<{version:number;title:string;updatedAt:number;lastMutationId:string|null}>();assert(before,'task required');
    const marker=id('301'),record=id('302');
    // The SQL side effect remains gated even when UPDATE affects0 rows. Actual native D1 batch.
    const sideEffect=()=>repository.prepare(`INSERT INTO activity(id,workspaceId,taskId,actorId,eventType,payloadJson,createdAt) SELECT ?,?,?,?,?,?,? WHERE ${taskMarkerSql()}`,[record,wid,taskId,actor,'task.updated','{}',0,...taskMarkerParameters(scope,taskId,marker)]);
    let results=await repository.batch([taskVersionGate(repository,scope,taskId,before!.version+1,marker,0),sideEffect()]);assert(results[0]?.meta.changes===0 && results[1]?.meta.changes===0,'stale CAS effects');
    try{requireMatchedVersion(results);throw new Error('Expected409');}catch(error){assert(error instanceof Error && 'code' in error && error.code==='CONFLICT','stale conflict');}passed.push('stale-CAS-zero-side-effects');
    results=await repository.batch([taskVersionGate(repository,scope,sourceId('tasks','t49'),1,id('303'),0)]);assert(results[0]?.meta.changes===0,'private Owner bypass');passed.push('private-CAS-no-Owner-bypass');
    // A mid-batch cross-workspace FK failure must roll back the preceding root version update.
    let failed=false;try{await repository.batch([taskVersionGate(repository,scope,taskId,before!.version,marker,0),repository.prepare('UPDATE tasks SET projectId=? WHERE workspaceId=? AND id=?',[otherProject,wid,taskId]),repository.prepare('UPDATE tasks SET assigneeId=? WHERE workspaceId=? AND id=?',[id('304'),wid,taskId])]);}catch{failed=true;}
    assert(failed,'FK must fail');assert((await env.DB.prepare('SELECT version FROM tasks WHERE id=?').bind(taskId).first<{version:number}>())?.version===before!.version,'root rollback');passed.push('mid-batch-FK-rollback');
    // Workspace B project really exists; workspace A cannot reference it.
    const foreign=(await env.DB.prepare('SELECT id FROM projects WHERE workspaceId=? LIMIT 1').bind(sourceId('workspaces','w2')).first<{id:string}>())!;
    failed=false;try{await repository.batch([taskVersionGate(repository,scope,taskId,before!.version,marker,0),sideEffect(),repository.prepare('UPDATE tasks SET projectId=? WHERE workspaceId=? AND id=?',[foreign.id,wid,taskId])]);}catch{failed=true;}
    assert(failed,'cross-scope FK must fail');assert((await env.DB.prepare('SELECT version FROM tasks WHERE id=?').bind(taskId).first<{version:number}>())?.version===before!.version,'cross scope root rollback');assert(!(await env.DB.prepare('SELECT id FROM activity WHERE id=?').bind(record).first()),'history rollback');passed.push('cross-scope-FK-root-history-rollback');
    // CHECK constraints including SQLite NULL behavior and strict bounded foundation.
    for(const payload of ['{}','{"kind":"task.delete","targets":null}','{"kind":"task.delete","targets":[]}']){failed=false;try{await env.DB.prepare('INSERT INTO commandUndoRecords(id,workspaceId,actorMemberId,kind,payloadVersion,payloadJson,createdAt) VALUES(?,?,?,?,?,?,?)').bind(record,wid,actor,'task.delete',1,payload,0).run();}catch{failed=true;}assert(failed,'malformed Undo SQLCHECK');}passed.push('Undo-missing-null-empty-targets-reject');
    const empty=encodeUndoPayload({kind:'tasks.archiveCompletedColumn',targets:[],activityIds:[]});assert(decodeUndoPayload(empty).targets.length===0,'empty archive');
    await env.DB.prepare('INSERT INTO commandUndoRecords(id,workspaceId,actorMemberId,kind,payloadVersion,payloadJson,createdAt) VALUES(?,?,?,?,?,?,?)').bind(record,wid,actor,'tasks.archiveCompletedColumn',1,empty,0).run();await env.DB.prepare('DELETE FROM commandUndoRecords WHERE id=?').bind(record).run();passed.push('Undo-empty-archive-noop-permitted');
    failed=false;try{await env.DB.prepare("UPDATE files SET storageMode='r2',objectKey='object',contentSha256='hash',mimeType='text/plain',sizeBytes=NULL WHERE id=?").bind(sourceId('files','f1')).run();}catch{failed=true;}assert(failed,'R2 NULL size reject');passed.push('r2-null-size-check');
    failed=false;try{await env.DB.prepare('UPDATE tasks SET createRequestId=? WHERE id=?').bind('only-key',taskId).run();}catch{failed=true;}assert(failed,'request pair reject');passed.push('idempotency-key-hash-pair');
    const target={id:taskId,postVersion:1,before:{archivedAt:null,deletedAt:null,deletedBy:null,updatedAt:'2026-10-08T09:00:00Z'}};
    failed=false;try{encodeUndoPayload({kind:'tasks.bulkDelete',targets:Array(129).fill(target),activityIds:[]});}catch{failed=true;}assert(failed,'Undo max128');
    failed=false;try{encodeUndoPayload({kind:'team.delete',targets:Array(128).fill({id:actor,postVersion:1,entity:'member',before:{teamId:null,nameNormalized:'é'.repeat(240),archivedAt:null,deletedAt:null,removedAt:null}}),activityIds:[]});}catch{failed=true;}assert(failed,'Undo bytes65536');
    const result={undoId:record,kind:'tasks.archiveCompletedColumn',appliedAt:'2026-10-08T09:00:00Z',affected:{taskIds:[],projectIds:[],teamIds:[],memberIds:[],commentIds:[],fileIds:[]}};assert(decodeUndoResult(encodeUndoResult(result)).undoId===record,'result schemas');passed.push('Undo-runtime-128target-UTF8bytes-result-schema');
    const budget=new RequestRepository(env.DB);budget.reserve(49);failed=false;try{await budget.batch([budget.prepare('SELECT 1'),budget.prepare('SELECT 2')]);}catch{failed=true;}assert(failed && budget.statements===49,'50query prewrite budget');failed=false;try{budget.prepare('SELECT 1',Array(101).fill(1));}catch{failed=true;}assert(failed,'100params');passed.push('50queries-100params-prewrite-budget');
    // Successful CAS+marker gate, then restore only test mutation to keep the fixture stable.
    results=await repository.batch([taskVersionGate(repository,scope,taskId,before!.version,marker,0),sideEffect()]);requireMatchedVersion(results);assert(results[1]?.meta.changes===1,'matched CAS effect');
    await env.DB.batch([env.DB.prepare('DELETE FROM activity WHERE id=?').bind(record),env.DB.prepare('UPDATE tasks SET version=?,updatedAt=?,lastMutationId=? WHERE id=?').bind(before!.version,before!.updatedAt,before!.lastMutationId,taskId)]);passed.push('matched-CAS-marker-side-effect');
    return Response.json({passed});
  }
  return app.fetch(request,env,context);
}};
