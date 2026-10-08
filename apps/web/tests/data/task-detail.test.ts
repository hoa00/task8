import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDescription, plainDescriptionHtml } from '@studio/domain';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { runTaskFieldOperation } from '../../src/data/mock/task-fields.ts';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { StudioApiError } from '../../src/data/errors.ts';
import { sourceId } from '@studio/contracts/source-identities';
import { TaskSubmission } from '../../src/features/tasks/detail/submission.ts';
import type { OperationInput } from '@studio/contracts/api';
import { CreateTaskInputSchema } from '@studio/contracts/api';
import { createStudioClient } from '../../src/data/operations.ts';
const workspaceId = sourceId('workspaces','w1'), projectId = sourceId('projects','p1');
const code = (value: string) => (cause: unknown) => cause instanceof StudioApiError && cause.detail.code === value;
test('Worker-compatible tree sanitizer allowlist, entities, protocols, discarded namespaces and canonical sanitized text', () => {
 const html = '<p onclick="alert(1)">One <b>bold</b> &amp; <i>italic</i><br>two</p><ul><li>item</li></ul><script>bad</script><style>x</style><iframe>bad</iframe><svg><a>foreign</a></svg><a href="&#x6a;avascript:alert(1)" target="_blank">unsafe</a><a href="https://example.com/?a=1&amp;b=2" target="_blank" onmouseover="x">safe</a>';
 const result = normalizeDescription(html); assert.equal(result.html,'<p>One <strong>bold</strong> &amp; <em>italic</em><br>two</p><ul><li>item</li></ul><a>unsafe</a><a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">safe</a>'); assert.equal(result.text,'One bold & italic two item unsafesafe'); assert.deepEqual(normalizeDescription(result.html),result);
 assert.deepEqual(normalizeDescription('<div>one</div><div>two</div>'), { html: 'onetwo', text: 'onetwo' });
 assert.equal(normalizeDescription(plainDescriptionHtml('<script>literal</script>\nNext')).text,'<script>literal</script> Next'); assert.throws(()=>normalizeDescription('x'.repeat(100001)));
});
test('atomic draft child create, canonical text, normalized actor/key replay and relations before writes', async () => {
 const data = createSeedDataset(), requestId = crypto.randomUUID(), body = { clientRequestId: requestId, projectId, title:'Draft aggregate', descriptionHtml:'<b>Hello</b><script>bad</script>', subtasks:[{title:'Child',assigneeId:data.currentMemberId}] };
 const create = () => runTaskFieldOperation('createTask',{body},data,fixtureClock) as Promise<{data:{task:typeof data.tasks[keyof typeof data.tasks]}}>;
 const [a,b] = await Promise.all([create(),create()]); assert.equal(a.data.task.id,b.data.task.id); assert.equal(a.data.task.key,'WEB-201'); assert.equal(data.taskCommands.descriptionTexts[a.data.task.id],'Hello'); assert.equal(data.tasks[a.data.task.id]!.descriptionHtml,'<strong>Hello</strong>'); assert.equal(Object.values(data.subtasks).filter(row=>row.taskId===a.data.task.id).length,1);
 await assert.rejects(runTaskFieldOperation('createTask',{body:{...body,title:'Different'}},data,fixtureClock),code('CONFLICT'));
 const before=structuredClone(data); await assert.rejects(runTaskFieldOperation('createTask',{body:{...body,clientRequestId:crypto.randomUUID(),subtasks:[{title:'Bad',assigneeId:'019a6257-0480-7000-8000-000000009999'}]}},data,fixtureClock),code('VALIDATION_ERROR')); assert.deepEqual(data,before);
 await runTaskFieldOperation('updateTask',{taskId:a.data.task.id,body:{expectedVersion:1,descriptionHtml:'<p>Updated <i>text</i><img src=x onerror=x></p>'}},data,fixtureClock); assert.equal(data.taskCommands.descriptionTexts[a.data.task.id],'Updated text');
});
test('single lifecycle Undo bounded guards, child/file touches block completion inverse, duplicate clean IDs', async () => {
 const client=createMockClient(), created=(await client.api.createTask({workspaceId,body:{clientRequestId:crypto.randomUUID(),projectId,title:'Lifecycle',subtasks:[{title:'child'}]}})).data.task;
 const complete=await client.api.setTaskCompletion({workspaceId,taskId:created.id,body:{expectedVersion:created.version,completed:true}});
 const upload=await client.api.uploadProjectFile({workspaceId,projectId,body:{taskId:created.id,clientRequestId:crypto.randomUUID(),file:{name:'same.txt',mimeType:'text/plain',bytes:new Uint8Array([1,2])}}}); assert.equal(upload.data.contentAvailable,false); assert.equal(upload.data.storageMode,'sample');
 await assert.rejects(client.api.undoCommand({workspaceId,undoId:complete.data.undo!.id,body:{}}),code('CONFLICT'));
 const task=(await client.api.getTask({workspaceId,taskId:created.id})).data.task, archived=await client.api.archiveTask({workspaceId,taskId:task.id,body:{expectedVersion:task.version}}); assert.equal((await client.api.listTasks({workspaceId,query:{q:'Lifecycle'}})).data.total,0);
 const undoInput={workspaceId,undoId:archived.data.undo!.id,body:{}}; const restored=await client.api.undoCommand(undoInput); assert.deepEqual(await client.api.undoCommand(undoInput),restored);
 const current=(await client.api.getTask({workspaceId,taskId:task.id})).data, duplicate=(await client.api.duplicateTask({workspaceId,taskId:task.id,body:{expectedVersion:current.task.version}})).data.task, detail=(await client.api.getTask({workspaceId,taskId:duplicate.id})).data; assert.equal(detail.task.attachmentCount,0);assert.equal(detail.task.commentCount,0);assert.equal(detail.task.isFavorite,false);assert.equal(detail.task.status,'todo');assert.notEqual(detail.subtasks[0]!.id,current.subtasks[0]!.id);
 const deleted=await client.api.deleteTask({workspaceId,taskId:task.id,body:{expectedVersion:current.task.version}});await assert.rejects(client.api.getTask({workspaceId,taskId:task.id}),code('NOT_FOUND'));await client.api.undoCommand({workspaceId,undoId:deleted.data.undo!.id,body:{}});assert.equal((await client.api.getTask({workspaceId,taskId:task.id})).data.attachments[0]!.id,upload.data.id);
});
test('upload content hash identity, concurrent replay, duplicate names, scope/size checks, file tombstone Undo', async()=>{
 const client=createMockClient(),task=(await client.api.createTask({workspaceId,body:{clientRequestId:crypto.randomUUID(),projectId,title:'Files'}})).data.task;
 const body={taskId:task.id,clientRequestId:crypto.randomUUID(),file:{name:'same.pdf',mimeType:'application/pdf',bytes:new Uint8Array([7])}};
 const [a,b]=await Promise.all([client.api.uploadProjectFile({workspaceId,projectId,body}),client.api.uploadProjectFile({workspaceId,projectId,body})]);assert.equal(a.data.id,b.data.id);
 await assert.rejects(client.api.uploadProjectFile({workspaceId,projectId,body:{...body,file:{...body.file,bytes:new Uint8Array([8])}}}),code('CONFLICT'));
 const second=await client.api.uploadProjectFile({workspaceId,projectId,body:{...body,clientRequestId:crypto.randomUUID()}});assert.notEqual(second.data.id,a.data.id);
 const deleted=await client.api.deleteFile({workspaceId,fileId:a.data.id,body:{expectedVersion:1}});assert.deepEqual((await client.api.getTask({workspaceId,taskId:task.id})).data.attachments.map(row=>row.id),[second.data.id]);await client.api.undoCommand({workspaceId,undoId:deleted.data.undo!.id,body:{}});assert.equal((await client.api.getTask({workspaceId,taskId:task.id})).data.attachments.length,2);
 await assert.rejects(client.api.uploadProjectFile({workspaceId,projectId:sourceId('projects','p2'),body:{...body,clientRequestId:crypto.randomUUID()}}),code('VALIDATION_ERROR'));
 await assert.rejects(client.api.uploadProjectFile({workspaceId,projectId,body:{...body,clientRequestId:crypto.randomUUID(),file:{...body.file,bytes:new Uint8Array(10485761)}}}));
});
test('form lost create/upload response, shared pending promise, partial retry and session reload retain identities',async()=>{
 const real=createMockClient(), record=new Map<string,string>(), storage={getItem:(k:string)=>record.get(k)??null,setItem:(k:string,v:string)=>{record.set(k,v);},removeItem:(k:string)=>{record.delete(k);}}, memberId=(await real.api.getBootstrap({workspaceId})).data.currentMember.id;
 let createLost=true,uploadLost=true, createCalls=0,uploadCalls=0;
 const client=createStudioClient(async(id,input,options)=>{const result=await real.execute(id,input as OperationInput<typeof id>,options);if(id==='createTask'){createCalls++;if(createLost){createLost=false;throw Error('Lost create response');}}if(id==='uploadProjectFile'){uploadCalls++;if(uploadLost){uploadLost=false;throw Error('Lost upload response');}}return result;});
 const draft=new TaskSubmission(workspaceId,memberId,storage),file=new File(['hello'],'file.txt',{type:'text/plain'}), payload=CreateTaskInputSchema.parse({clientRequestId:crypto.randomUUID(),projectId,title:'One logical submit'});await draft.freeze(payload,[file]);
 const p=draft.run(client,()=>{},async()=>{}),same=draft.run(client,()=>{},async()=>{});assert.equal(p,same);await assert.rejects(p,/Lost create/);
 const reloaded=new TaskSubmission(workspaceId,memberId,storage);assert.equal(reloaded.state!.requestId,payload.clientRequestId);assert.equal(await reloaded.reselect(file),true);
 assert.equal(await reloaded.run(client,()=>{},async()=>{}),false);const id=reloaded.state!.taskId;assert.equal(reloaded.state!.files[0]!.status,'failed');assert.equal((await real.api.listTasks({workspaceId,query:{q:'One logical submit'}})).data.total,1);
 assert.equal(await reloaded.run(client,()=>{},async()=>{}),true);assert.equal(reloaded.state!.taskId,id);assert.equal((await real.api.getTask({workspaceId,taskId:id!})).data.attachments.length,1);assert.equal(createCalls,2);assert.equal(uploadCalls,2);
 const old=reloaded.state;reloaded.clear();assert.equal(reloaded.state,null);assert.equal(old!.taskId,id);assert.equal(record.size,0);
});
test('failed file hashing leaves draft editable and never creates a task without its intended files',async()=>{
 const client=createMockClient(), memberId=(await client.api.getBootstrap({workspaceId})).data.currentMember.id, submission=new TaskSubmission(workspaceId,memberId);
 const file=new File(['x'],'unreadable.txt');Object.defineProperty(file,'arrayBuffer',{value:()=>Promise.reject(Error('Unreadable file'))});
 await assert.rejects(submission.freeze(CreateTaskInputSchema.parse({clientRequestId:crypto.randomUUID(),projectId,title:'Must not create'}),[file]),/Unreadable/);assert.equal(submission.state,null);assert.equal(await submission.run(client,()=>{},async()=>{}),false);assert.equal((await client.api.listTasks({workspaceId,query:{q:'Must not create'}})).data.total,0);
});
test('edit move succeeds, PATCH fails, retry preserves confirmed phase and does not move twice',async()=>{
 const real=createMockClient(), task=(await real.api.createTask({workspaceId,body:{clientRequestId:crypto.randomUUID(),projectId,title:'Partial edit'}})).data.task;
 const {EditTaskCommit}=await import('../../src/features/tasks/detail/submission.ts');const commit=new EditTaskCommit(task);let moves=0,patches=0,failPatch=true;
 const client=createStudioClient(async(id,input,options)=>{if(id==='moveTask')moves++;if(id==='updateTask'){patches++;if(failPatch){failPatch=false;throw Error('Patch failed');}}return real.execute(id,input as OperationInput<typeof id>,options);});
 const save=()=>commit.save(client,workspaceId,sourceId('projects','p2'),{title:'Saved after retry'},async()=>{});await assert.rejects(save(),/Patch failed/);await save();await save();assert.equal(moves,1);assert.equal(patches,2);const current=(await real.api.getTask({workspaceId,taskId:task.id})).data.task;assert.equal(current.projectId,sourceId('projects','p2'));assert.equal(current.title,'Saved after retry');assert.equal(current.version,3);
});
test('reset during a late attachment preserves original target and cannot redirect into the new submission',async()=>{
 const real=createMockClient(),memberId=(await real.api.getBootstrap({workspaceId})).data.currentMember.id,submission=new TaskSubmission(workspaceId,memberId);let release:()=>void=()=>{};let held=false;
 const client=createStudioClient(async(id,input,options)=>{if(id==='uploadProjectFile'&&!held){held=true;await new Promise<void>(resolve=>{release=resolve;});}return real.execute(id,input as OperationInput<typeof id>,options);});
 await submission.freeze(CreateTaskInputSchema.parse({clientRequestId:crypto.randomUUID(),projectId,title:'Original late target'}),[new File(['old'],'old.txt')]);const first=submission.run(client,()=>{},async()=>{});while(!held)await new Promise(resolve=>setTimeout(resolve,0));const originalId=submission.state!.taskId!;submission.clear();
 await submission.freeze(CreateTaskInputSchema.parse({clientRequestId:crypto.randomUUID(),projectId,title:'New isolated target'}),[new File(['new'],'new.txt')]);await submission.run(client,()=>{},async()=>{});const newId=submission.state!.taskId!;release();await first;assert.notEqual(newId,originalId);assert.equal(submission.state!.taskId,newId);assert.deepEqual((await real.api.getTask({workspaceId,taskId:originalId})).data.attachments.map(file=>file.name),['old.txt']);assert.deepEqual((await real.api.getTask({workspaceId,taskId:newId})).data.attachments.map(file=>file.name),['new.txt']);
});

test('late file reselection cannot clear a newer same-file failure after reset',async()=>{
 const real=createMockClient(),memberId=(await real.api.getBootstrap({workspaceId})).data.currentMember.id,submission=new TaskSubmission(workspaceId,memberId);
 const client=createStudioClient(async(id,input,options)=>{if(id==='uploadProjectFile')throw Error('Current upload failure');return real.execute(id,input as OperationInput<typeof id>,options);});
 const payload=(title:string)=>CreateTaskInputSchema.parse({clientRequestId:crypto.randomUUID(),projectId,title}),file=()=>new File(['same'],'retry.txt',{type:'text/plain'});
 await submission.freeze(payload('Old reselect'),[file()]);await submission.run(client,()=>{},async()=>{});
 const delayed=file(),bytes=await delayed.arrayBuffer();let release:(value:ArrayBuffer)=>void=()=>{};Object.defineProperty(delayed,'arrayBuffer',{value:()=>new Promise<ArrayBuffer>(resolve=>{release=resolve;})});const old=submission.reselect(delayed);
 submission.clear();await submission.freeze(payload('New reselect'),[file()]);await submission.run(client,()=>{},async()=>{});const state=submission.state!,before=structuredClone(state);release(bytes);
 assert.equal(await old,false);assert.equal(submission.state,state);assert.deepEqual(submission.state,before);assert.equal(state.files[0]!.status,'failed');assert.equal(state.files[0]!.error,'Current upload failure');
});
