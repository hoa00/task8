import { captureIntent } from '../../data/operations';
import type { StudioClient } from '../../data/operations';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OperationId, OperationInput, UndoDescriptorDto } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { invalidateOperation } from '../../data/invalidation';
export function useTaskListCommands(workspaceId: string) {
  const { client } = useDataRuntime(), cache = useQueryClient();
  const [error, setError] = useState(''), [pending, setPending] = useState(0);
  async function run<K extends OperationId>(id: K, input: OperationInput<K>, intentClient:StudioClient=captureIntent(client)) {
    setError(''); setPending(value => value + 1);
    try { const result = await intentClient.execute(id, input); await invalidateOperation(cache, id, input); return result; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Changes could not be saved'); return null; }
    finally { setPending(value => value - 1); }
  }
  const undo = (descriptor: UndoDescriptorDto) => run('undoCommand', { workspaceId, undoId: descriptor.id, body: {} });
  return { run, undo, clearError: () => setError(''), error, pending: pending > 0 };
}
