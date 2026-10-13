import { captureIntent } from '../../data/operations';
import type { StudioClient } from '../../data/operations';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskSchema, UpdateTaskInputSchema } from '@studio/contracts/api';
import type { OperationInput, OperationOutput, TaskDto, UndoDescriptorDto } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { invalidateOperation } from '../../data/invalidation';
import { queryKeys } from '../../data/query-keys';
import type { TaskFieldPatch } from './field-types';
type CachedTask = OperationOutput<'getTask'>;
interface FieldMutation { baseline: TaskDto; patch: TaskFieldPatch; intentClient:StudioClient }
export function useTaskFieldCommands(task: TaskDto) {
  const { client, clock } = useDataRuntime(), queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ taskId: string; patch: TaskFieldPatch; error: string }>({ taskId: task.id, patch: {}, error: '' });
  const update = useMutation({
    mutationFn: ({ baseline, patch, intentClient }: FieldMutation) => patch.projectId !== undefined ? intentClient.api.moveTask({ workspaceId: baseline.workspaceId, taskId: baseline.id, body: { expectedVersion: baseline.version, targetProjectId: patch.projectId, scope: { q: '', filters: [], sortField: 'manual', sortDirection: 'asc', favoriteOnly: false, archived: false, rangeBasis: 'due' } } }) : intentClient.api.updateTask({ workspaceId: baseline.workspaceId, taskId: baseline.id, body: { expectedVersion: baseline.version, ...patch } as OperationInput<'updateTask'>['body'] }),
    onMutate: async ({ baseline, patch, intentClient }) => {
      const key = queryKeys.task(baseline.workspaceId, baseline.id); await queryClient.cancelQueries({ queryKey: key }); intentClient.assertIntent?.();
      const before = queryClient.getQueryData<CachedTask>(key);
      const prospective = TaskSchema.safeParse({ ...baseline, ...patch, completedAt: patch.status === 'done' ? clock.now() : patch.status ? null : baseline.completedAt });
      const optimistic = before && prospective.success && !patch.projectId ? { ...before, data: { ...before.data, task: prospective.data } } : undefined;
      if (optimistic) queryClient.setQueryData(key, optimistic);
      return { key, before, optimistic: queryClient.getQueryData<CachedTask>(key) };
    },
    onError: (_error, _variables, rollback) => { if (rollback?.before && queryClient.getQueryData(rollback.key) === rollback.optimistic) queryClient.setQueryData(rollback.key, rollback.before); },
    onSuccess: (result,{intentClient}) => { intentClient.assertIntent?.(); queryClient.setQueryData<CachedTask>(queryKeys.task(result.data.task.workspaceId, result.data.task.id), before => before && before.data.task.version <= result.data.task.version ? { ...before, data: { ...before.data, task: result.data.task } } : before); },
    onSettled: async (_data, _error, { baseline, patch }) => { if (patch.projectId) await invalidateOperation(queryClient, 'moveTask', { workspaceId: baseline.workspaceId, taskId: baseline.id, body: { expectedVersion: baseline.version, scope: { q: '', filters: [], sortField: 'manual', sortDirection: 'asc', favoriteOnly: false, archived: false, rangeBasis: 'due' }, targetProjectId: patch.projectId } }); else if (UpdateTaskInputSchema.safeParse({ expectedVersion: baseline.version, ...patch }).success) await invalidateOperation(queryClient, 'updateTask', { workspaceId: baseline.workspaceId, taskId: baseline.id, body: { expectedVersion: baseline.version, ...patch } as OperationInput<'updateTask'>['body'] }); },
  });
  async function patch(patch: TaskFieldPatch): Promise<boolean> { const baseline = task; setDraft({ taskId: baseline.id, patch, error: '' }); try { await update.mutateAsync({ baseline, patch, intentClient:captureIntent(client) }); setDraft(current => current.taskId === baseline.id ? { taskId: baseline.id, patch: {}, error: '' } : current); return true; } catch (cause) { setDraft(current => current.taskId === baseline.id ? { ...current, error: cause instanceof Error ? cause.message : 'Changes could not be saved' } : current); return false; } }
  async function complete(): Promise<UndoDescriptorDto | null> { const baseline = task; try { const input = { workspaceId: baseline.workspaceId, taskId: baseline.id, body: { expectedVersion: baseline.version, completed: baseline.status !== 'done' } }; const result = await client.api.setTaskCompletion(input); await invalidateOperation(queryClient, 'setTaskCompletion', input); return result.data.undo; } catch (cause) { setDraft(current => current.taskId === baseline.id ? { ...current, error: cause instanceof Error ? cause.message : 'Changes could not be saved' } : current); return null; } }
  async function undo(descriptor: UndoDescriptorDto): Promise<boolean> { const baseline = task; try { const input = { workspaceId: baseline.workspaceId, undoId: descriptor.id, body: {} }; await client.api.undoCommand(input); await invalidateOperation(queryClient, 'undoCommand', input); setDraft(current => current.taskId === baseline.id ? { ...current, error: '' } : current); return true; } catch (cause) { setDraft(current => current.taskId === baseline.id ? { ...current, error: cause instanceof Error ? cause.message : 'Undo could not be applied' } : current); return false; } }
  return { patch, complete, undo, error: draft.taskId === task.id ? draft.error : '', attempt: draft.taskId === task.id ? draft.patch : {}, pending: update.isPending && update.variables?.baseline.id === task.id };
}
