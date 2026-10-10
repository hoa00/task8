import { EntityIdSchema } from '@studio/contracts/api';
import type { FileDto } from '@studio/contracts/api';
import type { MockDataset } from './dataset.ts';
import { canReadMockProject } from './project-access.ts';
import { StudioApiError } from '../errors.ts';

// One visibility predicate for catalogue, Drawer, Search and every file command.
export function canReadMockFile(file: FileDto | undefined, data: MockDataset, includeDeleted = false): file is FileDto {
  const actor = data.members[data.currentMemberId];
  if (!actor || actor.workspaceId !== data.workspaceId || actor.status !== 'active' || !file || file.workspaceId !== data.workspaceId || (!includeDeleted && data.taskCommands.deletedFiles[file.id])) return false;
  const project = data.projects[file.projectId];
  if (!canReadMockProject(project, data) || project.archivedAt) return false;
  if (file.taskId) { const task = data.tasks[file.taskId]; if (!task || task.workspaceId !== file.workspaceId || task.projectId !== file.projectId || task.archivedAt || data.taskCommands.deletedTasks[task.id]) return false; }
  return true;
}
export function accessibleMockFile(data: MockDataset, id: string, includeDeleted = false): FileDto {
  const file = data.files[EntityIdSchema.parse(id)];
  if (!canReadMockFile(file, data, includeDeleted)) throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'File not found' } });
  return file;
}
