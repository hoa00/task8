import { useRef } from 'react';
import type { TaskDto, UpdateSubtaskInput } from '@studio/contracts/api';
import { useTaskListCommands } from '../useTaskListCommands';
// One scoped child command owner, also used by the form. Parent version is read
// from the current aggregate, never an array index or copied completion cache.
export function useSubtaskCommands(task: TaskDto) {
 const commands = useTaskListCommands(task.workspaceId), busy = useRef(false);
 async function guard<T>(run: () => Promise<T | null>): Promise<T | null> { if (busy.current) return null; busy.current=true;try{return await run();}finally{busy.current=false;} }
 return { ...commands, create: (title: string)=>guard(()=>commands.run('createSubtask',{workspaceId:task.workspaceId,taskId:task.id,body:{expectedTaskVersion:task.version,title}})), update: (subtaskId: string, patch: Omit<UpdateSubtaskInput,'expectedTaskVersion'>)=>guard(()=>commands.run('updateSubtask',{workspaceId:task.workspaceId,taskId:task.id,subtaskId,body:{expectedTaskVersion:task.version,...patch}})), remove: (subtaskId:string)=>guard(()=>commands.run('deleteSubtask',{workspaceId:task.workspaceId,taskId:task.id,subtaskId,body:{expectedTaskVersion:task.version}})), promote: (subtaskId:string)=>guard(()=>commands.run('promoteSubtask',{workspaceId:task.workspaceId,taskId:task.id,subtaskId,body:{expectedTaskVersion:task.version}})) };
}
