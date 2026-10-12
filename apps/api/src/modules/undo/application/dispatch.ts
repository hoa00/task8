import type { EntityId, MemberDto, UndoKind, UndoResultDto } from '@studio/contracts/api';
import { UndoKindSchema } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { undoComment } from '../../comments/index.ts';
import { undoProject } from '../../projects/index.ts';
import { undoTasks } from '../../tasks/index.ts';
import { undoTeam } from '../../teams/index.ts';
import type { UndoRecord } from '../persistence/record.ts';
import { readUndoRecord } from '../persistence/record.ts';
export type FileUndoPort = (
  repository: RequestRepository,
  scope: WorkspaceContext,
  record: UndoRecord,
  now: number,
) => Promise<UndoResultDto>;
export interface UndoContext {
  repository: RequestRepository;
  scope: WorkspaceContext;
  actor: MemberDto;
  record: UndoRecord;
  now: number;
}
export type UndoHandler = (context: UndoContext) => Promise<UndoResultDto>;
export function undoHandlers(fileUndo: FileUndoPort): Record<UndoKind, UndoHandler> {
  const tasks: UndoHandler = (c) => undoTasks(c.repository, c.scope, c.record, c.now),
    projects: UndoHandler = (c) => undoProject(c.repository, c.scope, c.record, c.now);
  return {
    'task.complete': tasks,
    'task.archive': tasks,
    'task.delete': tasks,
    'tasks.bulkDelete': tasks,
    'tasks.completeColumn': tasks,
    'tasks.archiveCompletedColumn': tasks,
    'project.archive': projects,
    'project.delete': projects,
    'team.delete': (c) => undoTeam(c.repository, c.scope, c.actor, c.record, c.now),
    'comment.delete': (c) => undoComment(c.repository, c.scope, c.record, c.now),
    'file.delete': (c) => fileUndo(c.repository, c.scope, c.record, c.now),
  };
}
export async function undoCommand(
  r: RequestRepository,
  s: WorkspaceContext,
  actor: MemberDto,
  id: EntityId,
  now: number,
  fileUndo: FileUndoPort,
): Promise<UndoResultDto> {
  const record = await readUndoRecord(r, s, id);
  if (!record) throw new ApiFailure('NOT_FOUND', 'Undo not found');
  const kind = UndoKindSchema.safeParse(record.kind);
  if (!kind.success) throw new ApiFailure('CAPABILITY_UNAVAILABLE', 'Undo kind is not implemented');
  return undoHandlers(fileUndo)[kind.data]({ repository: r, scope: s, actor, record, now });
}
