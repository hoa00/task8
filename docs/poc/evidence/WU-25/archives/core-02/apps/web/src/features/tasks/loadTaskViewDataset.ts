import type { TaskDto, TaskQuery, TaskSummaryDto } from '@studio/contracts/api';
import type { StudioClient } from '../../data/operations.ts';
export interface TaskViewDataset { items: readonly TaskDto[]; coverage: 'complete'; matchedCount: number; nextCursor: null; summary: TaskSummaryDto }
export async function loadTaskViewDataset(client: StudioClient, workspaceId: string, query: TaskQuery, signal?: AbortSignal): Promise<TaskViewDataset> {
 let cursor: string | undefined; const unique = new Map<string, TaskDto>(), cursors = new Set<string>();
 const scope=Object.fromEntries(Object.entries(query).filter(([key])=>!['cursor','limit'].includes(key)));
 const summaryPromise = client.execute('getTaskSummary', {workspaceId,query:scope}, signal ? {signal} : {});
 // Consume rejection immediately while page requests are still in flight.
 const summaryResult = summaryPromise.then(result=>({result}),error=>({error}));
 do {const page=await client.execute('listTasks',{workspaceId,query:{...scope,limit:200,...(cursor?{cursor}:{})}},signal?{signal}:{});page.data.items.forEach(task=>unique.set(task.id,task));cursor=page.data.nextCursor??undefined;if(cursor){if(cursors.has(cursor))throw new Error('The task cursor did not advance. Refresh and try again.');cursors.add(cursor);}}while(cursor);
 const settled=await summaryResult;if('error' in settled)throw settled.error;
 if(settled.result.data.total!==unique.size)throw new Error('The task scope changed while loading. Refresh and try again.');
 return {items:[...unique.values()],coverage:'complete',matchedCount:unique.size,nextCursor:null,summary:settled.result.data};
}
