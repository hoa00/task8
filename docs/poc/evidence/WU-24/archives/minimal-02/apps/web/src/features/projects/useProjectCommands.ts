import { useQueryClient } from '@tanstack/react-query';
import type { OperationId, OperationInput, UndoDescriptorDto } from '@studio/contracts/api';
import { invalidateOperation } from '../../data/invalidation';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
// A real CAS failure refreshes canonical versions while the owning project form
// retains its draft. No shared command behavior or HTTP fallback is changed.
export function useProjectCommands(workspaceId: string) { const commands = useTaskListCommands(workspaceId), cache = useQueryClient(); async function run<K extends OperationId>(id: K, input: OperationInput<K>) { const result = await commands.run(id, input); if (!result) await invalidateOperation(cache, id, input); return result; } return { ...commands, run, undo: (descriptor: UndoDescriptorDto) => run('undoCommand', { workspaceId, undoId: descriptor.id, body: {} }) }; }
