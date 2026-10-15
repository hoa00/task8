import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceId } from '@studio/contracts/source-identities';
import { normalizeDescription } from '@studio/domain';
import { createMockClient } from '../../src/data/adapters/mock.ts';
import { createSeedDataset, fixtureClock } from '../../src/data/mock/seed.ts';
import { runTaskOperation } from '../../src/data/mock/operation-registry.ts';
import { StudioApiError } from '../../src/data/errors.ts';
import { mockStorageKey } from '../../src/data/mock/persistence.ts';
const workspaceId=sourceId('workspaces','w1'),projectId=sourceId('projects','p1');
const code=(value:string)=>(error:unknown)=>error instanceof StudioApiError&&error.detail.code===value;
const create=async(client:ReturnType<typeof createMockClient>,title='Collaboration')=>(await client.api.createTask({workspaceId,body:{clientRequestId:crypto.randomUUID(),projectId,title}})).data.task;
test('canonical child CRUD, omitted fields, parent versions, progress and promotion inheritance are atomic',async()=>{
 const client=createMockClient(),task=await create(client);let detail=(await client.api.createSubtask({workspaceId,taskId:task.id,body:{expectedTaskVersion:task.version,title:'Child',note:'<literal>\nA&B',done:true,assigneeId:sourceId('members','m2'),dueDate:'2026-10-10'}})).data;
 const child=detail.subtasks[0]!;assert.equal(detail.task.version,2);assert.deepEqual(detail.task.subtaskSummary,{total:1,completed:1});
 await assert.rejects(client.api.updateSubtask({workspaceId,taskId:task.id,subtaskId:child.id,body:{expectedTaskVersion:1,title:'Stale'}}),code('CONFLICT'));
 detail=(await client.api.updateSubtask({workspaceId,taskId:task.id,subtaskId:child.id,body:{expectedTaskVersion:2,title:'Renamed'}})).data;assert.equal(detail.subtasks[0]!.note,child.note);assert.equal(detail.subtasks[0]!.done,true);
 const promoted=(await client.api.promoteSubtask({workspaceId,taskId:task.id,subtaskId:child.id,body:{expectedTaskVersion:3}})).data;
 assert.equal(promoted.undo,null);assert.equal(promoted.task.version,4);assert.deepEqual(promoted.task.subtaskSummary,{total:0,completed:0});const converted=promoted.createdTasks[0]!;assert.notEqual(converted.id,child.id);assert.equal(converted.title,'Renamed');assert.equal(converted.status,'done');assert.equal(converted.assigneeId,child.assigneeId);assert.equal(converted.dueDate,child.dueDate);assert.equal(normalizeDescription(converted.descriptionHtml).text,'<literal> A&B');assert.equal(converted.descriptionHtml.includes('<literal>'),false);assert.equal(converted.recurrence,null);assert.equal(converted.priority,task.priority);
 await assert.rejects(client.api.deleteSubtask({workspaceId,taskId:task.id,subtaskId:child.id,body:{expectedTaskVersion:4}}),code('NOT_FOUND'));
 detail=(await client.api.createSubtask({workspaceId,taskId:task.id,body:{expectedTaskVersion:4,title:'Delete'}})).data;const deleted=(await client.api.deleteSubtask({workspaceId,taskId:task.id,subtaskId:detail.subtasks[0]!.id,body:{expectedTaskVersion:5}})).data;assert.equal(deleted.task.version,6);assert.equal(deleted.subtasks.length,0);
});
test('child identity/scope validation and tombstones perform zero writes; every child command guards stale Undo',async()=>{
 const client=createMockClient(),a=await create(client,'Parent A'),b=await create(client,'Parent B'),detail=(await client.api.createSubtask({workspaceId,taskId:a.id,body:{expectedTaskVersion:1,title:'Scoped'}})).data;
 await assert.rejects(client.api.updateSubtask({workspaceId,taskId:b.id,subtaskId:detail.subtasks[0]!.id,body:{expectedTaskVersion:1,done:true}}),code('NOT_FOUND'));assert.equal((await client.api.getTask({workspaceId,taskId:b.id})).data.task.version,1);
 const complete=(await client.api.setTaskCompletion({workspaceId,taskId:a.id,body:{expectedVersion:2,completed:true}})).data;
 await client.api.updateSubtask({workspaceId,taskId:a.id,subtaskId:detail.subtasks[0]!.id,body:{expectedTaskVersion:3,note:'Later'}});await assert.rejects(client.api.undoCommand({workspaceId,undoId:complete.undo!.id,body:{}}),code('CONFLICT'));
 const current=(await client.api.getTask({workspaceId,taskId:a.id})).data.task;await client.api.deleteTask({workspaceId,taskId:a.id,body:{expectedVersion:current.version}});
 await assert.rejects(client.api.createSubtask({workspaceId,taskId:a.id,body:{expectedTaskVersion:current.version+1,title:'No resurrection'}}),code('NOT_FOUND'));
});
test('comments, mentions, reactions, delete and idempotent bounded Undo survive reload',async()=>{
 const entries=new Map<string,string>(),storage={getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);},removeItem:(key:string)=>{entries.delete(key);}};let client=createMockClient({storage});const task=await create(client);
 const posted=(await client.api.createComment({workspaceId,taskId:task.id,body:{bodyText:'@Alex Morgan <script>literal</script>',mentionedMemberIds:[sourceId('members','m2')]}})).data;assert.equal(posted.task.commentCount,1);assert.equal(posted.task.version,2);assert.equal(posted.comment.authorId,sourceId('members','m1'));
 const input={workspaceId,commentId:posted.comment.id,reactionKey:'👍' as const};await client.api.addCommentReaction(input);const version=(await client.api.getTask({workspaceId,taskId:task.id})).data.task.version;assert.equal(version,3);assert.deepEqual((await client.api.addCommentReaction(input)).data[0]!.memberIds,[posted.comment.authorId]);assert.equal((await client.api.getTask({workspaceId,taskId:task.id})).data.task.version,version);
 client=createMockClient({storage});const comment=(await client.api.listComments({workspaceId,taskId:task.id,query:{}})).data.items[0]!;assert.equal(comment.reactions[0]!.count,1);assert.equal(comment.bodyText,posted.comment.bodyText);assert.deepEqual(comment.mentionedMemberIds,posted.comment.mentionedMemberIds);
 const deletion=(await client.api.deleteComment({workspaceId,commentId:comment.id,body:{expectedVersion:comment.version}})).data;assert.equal(deletion.task.commentCount,0);assert.equal((await client.api.listComments({workspaceId,taskId:task.id,query:{}})).data.total,0);
 const undo={workspaceId,undoId:deletion.undo!.id,body:{}};client=createMockClient({storage});const result=await client.api.undoCommand(undo);assert.deepEqual(await client.api.undoCommand(undo),result);const restored=(await client.api.listComments({workspaceId,taskId:task.id,query:{}})).data.items[0]!;assert.equal(restored.id,comment.id);assert.deepEqual(restored.reactions,comment.reactions);assert.equal(restored.version,comment.version+2);
 await client.api.removeCommentReaction(input);assert.deepEqual((await client.api.removeCommentReaction(input)).data,[]);assert.ok(entries.get(mockStorageKey(workspaceId)));
});
test('comment deletion ownership, reaction/comment parent touches and stale inverse are enforced atomically',async()=>{
 const data=createSeedDataset(fixtureClock),task=Object.values(data.tasks).find(row=>row.key==='WEB-103')??Object.values(data.tasks)[0]!,other=Object.values(data.comments).find(row=>row.authorId!==data.currentMemberId)!;
 const before=structuredClone(data);await assert.rejects(runTaskOperation('deleteComment',{workspaceId,commentId:other.id,body:{expectedVersion:other.version}},data,fixtureClock),code('NOT_FOUND'));assert.deepEqual(data,before);
 const posted=await runTaskOperation('createComment',{workspaceId,taskId:task.id,body:{bodyText:'Own'}},data,fixtureClock) as {data:{comment:{id:string;version:number}}};const deleted=await runTaskOperation('deleteComment',{workspaceId,commentId:posted.data.comment.id,body:{expectedVersion:1}},data,fixtureClock) as {data:{undo:{id:string}}};
 await runTaskOperation('createSubtask',{workspaceId,taskId:task.id,body:{expectedTaskVersion:data.tasks[task.id]!.version,title:'Later child'}},data,fixtureClock);const stale=structuredClone(data);await assert.rejects(runTaskOperation('undoCommand',{workspaceId,undoId:deleted.data.undo.id,body:{}},data,fixtureClock),code('CONFLICT'));assert.deepEqual(data,stale);
 await assert.rejects(runTaskOperation('addCommentReaction',{workspaceId,commentId:posted.data.comment.id,reactionKey:'👍'},data,fixtureClock),code('NOT_FOUND'));assert.deepEqual(data,stale);
});
test('stable comments/activity pagination validates cursor scope and hidden task access',async()=>{
 const client=createMockClient(),task=await create(client),other=await create(client,'Other');for(let i=0;i<5;i++)await client.api.createComment({workspaceId,taskId:task.id,body:{bodyText:`Comment ${i}`}});
 const a=(await client.api.listComments({workspaceId,taskId:task.id,query:{limit:2}})).data,b=(await client.api.listComments({workspaceId,taskId:task.id,query:{limit:2,cursor:a.nextCursor!}})).data,c=(await client.api.listComments({workspaceId,taskId:task.id,query:{limit:2,cursor:b.nextCursor!}})).data;assert.equal(new Set([...a.items,...b.items,...c.items].map(row=>row.id)).size,5);assert.equal(c.nextCursor,null);await assert.rejects(client.api.listComments({workspaceId,taskId:other.id,query:{cursor:a.nextCursor!}}),code('VALIDATION_ERROR'));
 const activity=(await client.api.listActivity({workspaceId,query:{taskId:task.id,limit:2}})).data;assert.equal(activity.total,6);await assert.rejects(client.api.listActivity({workspaceId,query:{taskId:other.id,cursor:activity.nextCursor!}}),code('VALIDATION_ERROR'));
 const current=(await client.api.getTask({workspaceId,taskId:task.id})).data.task;await client.api.deleteTask({workspaceId,taskId:task.id,body:{expectedVersion:current.version}});await assert.rejects(client.api.listComments({workspaceId,taskId:task.id,query:{}}),code('NOT_FOUND'));await assert.rejects(client.api.listActivity({workspaceId,query:{taskId:task.id}}),code('NOT_FOUND'));
});
test('sanitizer serializes nested six-command content idempotently and rejects encoded/whitespace protocols',()=>{
 const input='<h4>Heading</h4><p><b>B</b><i>I</i><a href="https://example.com/?a=1&amp;b=2" target="_blank" onclick="bad()">Link</a></p><ul><li>A</li></ul><ol><li>B</li></ol><a href="java&#x73;cript:alert(1)">x</a><svg><foreignObject><p>no</p></foreignObject></svg><iframe srcdoc="bad"></iframe>';
 const normalized=normalizeDescription(input);assert.equal(normalized.html.includes('onclick'),false);assert.equal(normalized.html.includes('javascript'),false);assert.equal(normalized.html.includes('svg'),false);assert.equal(normalized.html.includes('iframe'),false);assert.equal(normalized.html.includes('rel="noopener noreferrer"'),true);assert.deepEqual(normalizeDescription(normalized.html),normalized);assert.equal(normalized.text,'Heading BILink A B x');
});
