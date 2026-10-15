import {
  encodeMockCursor as encode,
  decodeMockCursor,
  fileCursorSchema,
  fileTupleSchema,
  fileCursorTuple,
} from './cursor.ts';
import {
  EntityIdSchema,
  VersionInputSchema,
  FileSchema,
  UploadProjectFileInputSchema,
  FileQuerySchema,
  RenameFileInputSchema,
  DuplicateFileInputSchema,
} from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import { sourceFileType, displayFileSize } from '@studio/domain';
import { canReadMockProject as canReadProject } from './project-access.ts';
import { canReadMockFile } from './file-access.ts';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { fail, newMockId, fingerprint } from './primitives.ts';
import {
  getTask,
  editable,
  addActivity,
  accessibleFile,
  touchAttachments,
} from './task-aggregate.ts';

export async function executeFiles(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
): Promise<unknown> {
  switch (id) {
    case 'listProjectFiles': {
      const projectId = EntityIdSchema.parse(input.projectId),
        project = data.projects[projectId],
        actor = data.members[data.currentMemberId],
        query = FileQuerySchema.parse(input.query);
      if (
        !actor ||
        actor.workspaceId !== data.workspaceId ||
        actor.status !== 'active' ||
        !canReadProject(project, data) ||
        project.archivedAt
      )
        return fail('NOT_FOUND', 'Project not found');
      const rows = Object.values(data.files).filter(
        (file) =>
          file.projectId === projectId &&
          canReadMockFile(file, data) &&
          (!query.q || file.name.toLowerCase().includes(query.q.toLowerCase())) &&
          (!query.type || file.fileType === query.type),
      );
      const compare = (
        a: Pick<(typeof rows)[number], 'id' | 'name' | 'fileType' | 'sizeBytes' | 'createdAt'>,
        b: Pick<(typeof rows)[number], 'id' | 'name' | 'fileType' | 'sizeBytes' | 'createdAt'>,
      ) =>
        (query.sort === 'name'
          ? a.name.localeCompare(b.name)
          : query.sort === 'type'
            ? a.fileType.localeCompare(b.fileType)
            : query.sort === 'size'
              ? (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1)
              : b.createdAt.localeCompare(a.createdAt)) || a.id.localeCompare(b.id);
      rows.sort(compare);
      const { cursor, limit, ...filters } = query,
        signature = await fingerprint({
          workspaceId: data.workspaceId,
          actorId: data.currentMemberId,
          projectId,
          operation: id,
          ...filters,
        });
      let start = 0;
      if (cursor) {
        try {
          const value = decodeMockCursor(cursor, fileCursorSchema);
          if (value.signature !== signature || !fileTupleSchema.safeParse(value.tuple).success)
            return fail('VALIDATION_ERROR', 'Cursor belongs to a different query', 'cursor');
          const index = rows.findIndex((row) => compare(row, value.tuple) > 0);
          start = index < 0 ? rows.length : index;
        } catch {
          return fail('VALIDATION_ERROR', 'Invalid cursor', 'cursor');
        }
      }
      const items = rows.slice(start, start + limit),
        last = items.at(-1);
      return {
        data: {
          items,
          total: rows.length,
          nextCursor:
            last && start + items.length < rows.length
              ? encode({ signature, tuple: fileCursorTuple(last) })
              : null,
        },
      };
    }
    case 'renameFile':
    case 'duplicateFile': {
      const body =
          id === 'renameFile'
            ? RenameFileInputSchema.parse(input.body)
            : DuplicateFileInputSchema.parse(input.body),
        original = accessibleFile(data, String(input.fileId));
      if (original.version !== body.expectedVersion)
        return fail('CONFLICT', 'The file changed. Refresh and try again.');
      const name = body.name ?? original.name.replace(/(\.[^.]+)$/, ' copy$1');
      const next = FileSchema.parse(
        id === 'renameFile'
          ? { ...original, name, fileType: sourceFileType(name), version: original.version + 1 }
          : {
              ...original,
              id: newMockId(clock),
              name,
              fileType: sourceFileType(name),
              createdAt: clock.now(),
              createdBy: data.currentMemberId,
              version: 1,
            },
      );
      data.files[next.id] = next;
      if (original.taskId) {
        const task = data.tasks[original.taskId]!;
        data.tasks[task.id] = {
          ...task,
          version: task.version + 1,
          attachmentCount: Object.values(data.files).filter(
            (file) => file.taskId === task.id && canReadMockFile(file, data),
          ).length,
        };
      }
      return { data: next };
    }
    case 'getFile': {
      return { data: accessibleFile(data, String(input.fileId)) };
    }
    case 'uploadProjectFile': {
      const body = UploadProjectFileInputSchema.parse(input.body),
        projectId = EntityIdSchema.parse(input.projectId),
        project = data.projects[projectId];
      const actor = data.members[data.currentMemberId];
      if (
        !actor ||
        actor.workspaceId !== data.workspaceId ||
        actor.status !== 'active' ||
        !canReadProject(project, data) ||
        project.archivedAt
      )
        return fail('NOT_FOUND', 'Project not found');
      const task = body.taskId ? getTask(data, body.taskId) : null;
      if (task && (task.projectId !== projectId || task.archivedAt))
        return fail(
          'VALIDATION_ERROR',
          'File target must be an active task in this project',
          'taskId',
        );
      const contentHash = await crypto.subtle.digest(
        'SHA-256',
        body.file.bytes as Uint8Array<ArrayBuffer>,
      );
      const signature = await fingerprint({
        projectId,
        taskId: body.taskId ?? null,
        name: body.file.name,
        mimeType: body.file.mimeType,
        size: body.file.bytes.byteLength,
        contentHash: [...new Uint8Array(contentHash)],
      });
      const requests = data.taskCommands.uploadRequests[data.currentMemberId] ?? {},
        prior = requests[body.clientRequestId];
      if (prior) {
        if (prior.fingerprint !== signature)
          return fail('CONFLICT', 'Upload request ID was reused with different content');
        const file = accessibleFile(data, prior.fileId);
        if (file.projectId !== projectId || file.taskId !== (body.taskId ?? null))
          return fail('CONFLICT', 'The file target changed');
        return { data: file };
      }
      const file = FileSchema.parse({
        id: newMockId(clock),
        workspaceId: data.workspaceId,
        projectId,
        taskId: task?.id ?? null,
        name: body.file.name,
        fileType: sourceFileType(body.file.name),
        mimeType: body.file.mimeType,
        sizeBytes: body.file.bytes.byteLength,
        displaySize: displayFileSize(body.file.bytes.byteLength),
        storageMode: 'sample',
        contentAvailable: false,
        createdBy: data.currentMemberId,
        createdAt: clock.now(),
        version: 1,
      });
      data.files[file.id] = file;
      requests[body.clientRequestId] = { fingerprint: signature, fileId: file.id };
      data.taskCommands.uploadRequests[data.currentMemberId] = requests;
      if (task) {
        touchAttachments(data, task, clock);
        addActivity(data, data.tasks[task.id]!, 'file.created', clock);
      }
      return { data: file };
    }
    case 'deleteFile': {
      const body = VersionInputSchema.parse(input.body),
        file = accessibleFile(data, String(input.fileId));
      if (file.version !== body.expectedVersion)
        return fail('CONFLICT', 'The file changed. Refresh and try again.');
      const task = file.taskId
          ? editable(data, file.taskId, data.tasks[file.taskId]!.version)
          : null,
        lifecycleAt = clock.now(),
        next = { ...file, version: file.version + 1 };
      data.files[file.id] = next;
      data.taskCommands.deletedFiles[file.id] = lifecycleAt;
      if (task) touchAttachments(data, task, clock);
      const undoId = newMockId(clock),
        activityIds = task ? [addActivity(data, data.tasks[task.id]!, 'file.deleted', clock)] : [];
      data.taskCommands.lifecycleUndoRecords[undoId] = {
        actorId: data.currentMemberId,
        kind: 'file.delete',
        entityId: file.id,
        postVersion: next.version,
        lifecycleAt,
        previousArchivedAt: null,
        taskId: task?.id ?? null,
        taskPostVersion: task ? data.tasks[task.id]!.version : null,
        activityIds,
        result: null,
      };
      return { data: { file: next, undo: { id: undoId, kind: 'file.delete' } } };
    }
    default:
      throw new TypeError('Unsupported files operation');
  }
}
