import { FileSchema } from '@studio/contracts/api';
import { instant } from '../../shared/clock.ts';
export interface FileDtoInput {
  id: string;
  workspaceId: string;
  projectId: string;
  taskId: string | null;
  name: string;
  fileType: string;
  mimeType: string | null;
  sizeBytes: number | null;
  displaySize: string;
  storageMode: string;
  createdBy: string;
  createdAt: number;
  version: number;
}
export const fileDto = (f: FileDtoInput) =>
  FileSchema.parse({
    id: f.id,
    workspaceId: f.workspaceId,
    projectId: f.projectId,
    taskId: f.taskId,
    name: f.name,
    fileType: f.fileType,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    displaySize: f.displaySize,
    storageMode: f.storageMode,
    contentAvailable: f.storageMode === 'r2',
    createdBy: f.createdBy,
    createdAt: instant(f.createdAt),
    version: f.version,
  });
