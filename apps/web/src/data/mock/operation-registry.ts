import { EntityIdSchema } from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';

import { transactMock } from './transaction.ts';
import type { Clock } from '@studio/domain';
import { StudioApiError } from '../errors.ts';
import type { MockDataset } from './dataset.ts';
import { fail } from './primitives.ts';
import { executeSubtasks } from './subtasks.ts';
import { executeComments } from './comments.ts';
import { executeFiles } from './files.ts';
import { executeActivity } from './activity.ts';
import { executeTaskReads } from './task-reads.ts';
import { executeTaskUndo } from './task-undo.ts';
import { executeTaskCommands } from './task-commands.ts';
export const taskOperationIds = [
  'createTask',
  'bulkMutateTasks',
  'updateSubtask',
  'createSubtask',
  'deleteSubtask',
  'promoteSubtask',
  'listComments',
  'createComment',
  'deleteComment',
  'restoreDeletedComment',
  'addCommentReaction',
  'removeCommentReaction',
  'listActivity',
  'listMembers',
  'getTask',
  'listTasks',
  'getTaskSummary',
  'updateTask',
  'moveTask',
  'setTaskCompletion',
  'undoCommand',
  'duplicateTask',
  'archiveTask',
  'restoreTask',
  'deleteTask',
  'addTaskFavorite',
  'removeTaskFavorite',
  'getFile',
  'listProjectFiles',
  'renameFile',
  'duplicateFile',
  'uploadProjectFile',
  'deleteFile',
] as const satisfies readonly OperationId[];
type MockOperationHandler = (
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
) => Promise<unknown>;
export const taskOperationHandlers = {
  createSubtask: executeSubtasks,
  updateSubtask: executeSubtasks,
  deleteSubtask: executeSubtasks,
  promoteSubtask: executeSubtasks,
  listComments: executeComments,
  createComment: executeComments,
  deleteComment: executeComments,
  restoreDeletedComment: executeComments,
  addCommentReaction: executeComments,
  removeCommentReaction: executeComments,
  getFile: executeFiles,
  listProjectFiles: executeFiles,
  renameFile: executeFiles,
  duplicateFile: executeFiles,
  uploadProjectFile: executeFiles,
  deleteFile: executeFiles,
  listActivity: executeActivity,
  listMembers: executeActivity,
  getTask: executeTaskReads,
  listTasks: executeTaskReads,
  getTaskSummary: executeTaskReads,
  undoCommand: executeTaskUndo,
  createTask: executeTaskCommands,
  duplicateTask: executeTaskCommands,
  addTaskFavorite: executeTaskCommands,
  removeTaskFavorite: executeTaskCommands,
  restoreTask: executeTaskCommands,
  archiveTask: executeTaskCommands,
  deleteTask: executeTaskCommands,
  bulkMutateTasks: executeTaskCommands,
  updateTask: executeTaskCommands,
  moveTask: executeTaskCommands,
  setTaskCompletion: executeTaskCommands,
} as const satisfies Partial<Record<OperationId, MockOperationHandler>>;
function executeTaskOperation(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
) {
  if (!Object.hasOwn(taskOperationHandlers, id)) throw new TypeError('Unsupported mock operation');
  return taskOperationHandlers[id as keyof typeof taskOperationHandlers](id, input, data, clock);
}
export async function runTaskOperation(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
  persist?: (staged: MockDataset) => boolean,
): Promise<unknown> {
  if (
    ([
      'getFile',
      'listProjectFiles',
      'renameFile',
      'duplicateFile',
      'uploadProjectFile',
      'deleteFile',
    ].includes(id) ||
      (id === 'undoCommand' &&
        data.taskCommands.lifecycleUndoRecords[EntityIdSchema.parse(input.undoId)]?.kind ===
          'file.delete')) &&
    input.workspaceId &&
    input.workspaceId !== data.workspaceId
  )
    return fail('NOT_FOUND', 'File not found');
  if (
    [
      'getTask',
      'listTasks',
      'getTaskSummary',
      'getFile',
      'listProjectFiles',
      'listComments',
      'listActivity',
      'listMembers',
    ].includes(id)
  )
    return executeTaskOperation(id, input, data, clock);
  return transactMock(data, async (staged) => {
    const result = await executeTaskOperation(id, input, staged, clock);
    if (persist && !persist(staged))
      throw new StudioApiError({
        error: { code: 'INTERNAL_ERROR', message: 'Changes could not be saved. Try again.' },
      });
    return result;
  });
}
