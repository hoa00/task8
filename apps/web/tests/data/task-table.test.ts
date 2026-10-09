import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceId } from '@studio/contracts/source-identities';
import { normalizeTaskView } from '@studio/domain';
import { restoreTaskColumns, taskTablePreferenceKey } from '../../src/features/tasks/table-view.ts';
test('Table preferences isolate Workspace/Project/saved and initialize Project column once', () => {
 const projectId=sourceId('projects','p1'),savedViewId=sourceId('savedViews','v1');
 const view=normalizeTaskView(),workspace=taskTablePreferenceKey('w',{kind:'workspace'}),project=taskTablePreferenceKey('w',{kind:'project',projectId}),saved=taskTablePreferenceKey('w',{kind:'saved',projectId,savedViewId});
 assert.equal(new Set([workspace,project,saved]).size,3);
 assert.deepEqual(restoreTaskColumns(view,workspace,false,null),view);
 assert.equal(restoreTaskColumns(view,project,true,null).hiddenColumns.includes('project'),true);
 const restored=restoreTaskColumns(view,project,true,{getItem:()=>JSON.stringify({hiddenColumns:['start'],columnWidths:{title:1200}})});
 assert.equal(restored.hiddenColumns.includes('project'),false);assert.equal(restored.columnWidths.title,1200);assert.deepEqual(restored.query,view.query);
 assert.equal(restoreTaskColumns(view,project,true,{getItem:()=>'{invalid'}).hiddenColumns.includes('project'),true);
 assert.deepEqual(restoreTaskColumns(view,workspace,false,{getItem:()=>JSON.stringify({hiddenColumns:['title']})}),view);
});
test('Table widths follow source64 minimum and preserve large finite resize in URL state',()=>{
 assert.equal(normalizeTaskView({columnWidths:{title:64,status:1320}}).columnWidths.status,1320);
 for(const width of [63,NaN,Infinity,-1])assert.throws(()=>normalizeTaskView({columnWidths:{title:width}}));
});
