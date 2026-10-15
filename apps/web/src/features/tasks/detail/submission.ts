import {
  CreateTaskInputSchema,
  EntityIdSchema,
  ClientRequestIdSchema,
} from '@studio/contracts/api';
import type { CreateTaskInput, EntityId, TaskDto, UpdateTaskInput } from '@studio/contracts/api';
import type { StudioClient } from '../../../data/operations.ts';
import { captureIntent } from '../../../data/operations.ts';
export type FileIntentStatus = 'queued' | 'uploading' | 'attached' | 'failed';
export interface FileIntent {
  requestId: string;
  name: string;
  mimeType: string;
  size: number;
  hash: string;
  status: FileIntentStatus;
  fileId?: EntityId;
  error?: string;
}
export interface PendingSubmission {
  requestId: string;
  payload: CreateTaskInput;
  prepared: boolean;
  taskId?: EntityId;
  taskKey?: string;
  files: FileIntent[];
}
export interface SubmissionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const namespace = (workspaceId: string, memberId: string) =>
  `task8.task-form.v1:${workspaceId}:${memberId}`;
export async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
// Stores only submission metadata/intent, never a server DTO/cache or file bytes.
export class TaskSubmission {
  readonly workspaceId: string;
  readonly memberId: string;
  readonly storage: SubmissionStorage | undefined;
  state: PendingSubmission | null = null;
  private files = new Map<string, File>();
  private inflight: { state: PendingSubmission; promise: Promise<boolean> } | null = null;
  constructor(workspaceId: string, memberId: string, storage?: SubmissionStorage) {
    this.workspaceId = workspaceId;
    this.memberId = memberId;
    this.storage = storage;
    try {
      const raw = storage?.getItem(namespace(workspaceId, memberId));
      if (raw) {
        const parsed = JSON.parse(raw) as PendingSubmission;
        const payload = CreateTaskInputSchema.parse(parsed.payload);
        if (
          parsed.prepared !== true ||
          parsed.requestId !== payload.clientRequestId ||
          !Array.isArray(parsed.files) ||
          parsed.files.length > 128
        )
          throw new TypeError('Invalid pending submission');
        if (parsed.taskId) EntityIdSchema.parse(parsed.taskId);
        parsed.files.forEach((file) => {
          ClientRequestIdSchema.parse(file.requestId);
          if (
            typeof file.name !== 'string' ||
            typeof file.mimeType !== 'string' ||
            !Number.isSafeInteger(file.size) ||
            file.size > 10485760 ||
            !/^[a-f0-9]{64}$/.test(file.hash) ||
            !['queued', 'uploading', 'attached', 'failed'].includes(file.status)
          )
            throw new TypeError('Invalid file intent');
          if (file.fileId) EntityIdSchema.parse(file.fileId);
          if (file.status !== 'attached') {
            file.status = 'failed';
            file.error = 'Select this file again to retry';
          }
        });
        this.state = { ...parsed, payload };
      }
    } catch {
      storage?.removeItem(namespace(workspaceId, memberId));
    }
  }
  private save() {
    try {
      if (this.state)
        this.storage?.setItem(
          namespace(this.workspaceId, this.memberId),
          JSON.stringify(this.state),
        );
      else this.storage?.removeItem(namespace(this.workspaceId, this.memberId));
    } catch {
      /* storage is optional; memory still preserves the active intent */
    }
  }
  async freeze(payload: CreateTaskInput, files: readonly File[]): Promise<void> {
    if (this.state) return;
    // Identity/payload freeze happens synchronously before awaiting File reads.
    const state: PendingSubmission = {
      requestId: payload.clientRequestId,
      payload: structuredClone(CreateTaskInputSchema.parse(payload)),
      prepared: false,
      files: [],
    };
    this.state = state;
    if (files.length > 128) {
      this.state = null;
      throw new RangeError('Choose at most 128 files');
    }
    let intents: FileIntent[];
    const preparedFiles = new Map<string, File>();
    try {
      intents = await Promise.all(
        files.map(async (file) => {
          if (file.size > 10485760) throw new RangeError('File exceeds 10 MiB');
          const intent: FileIntent = {
            requestId: crypto.randomUUID(),
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            hash: await hashFile(file),
            status: 'queued',
          };
          preparedFiles.set(intent.requestId, file);
          return intent;
        }),
      );
    } catch (cause) {
      if (this.state === state) {
        this.clear();
      }
      throw cause;
    }
    // Close/reset cannot redirect late File reads into a newer submission.
    if (this.state === state) {
      state.files = intents;
      this.files = preparedFiles;
      state.prepared = true;
      this.save();
    }
  }
  async reselect(file: File): Promise<boolean> {
    const state = this.state,
      files = this.files,
      intents = state?.files;
    if (!state || !intents) return false;
    const hash = await hashFile(file);
    if (this.state !== state || this.files !== files || state.files !== intents) return false;
    const intent = intents.find(
      (row) =>
        row.status !== 'attached' &&
        row.name === file.name &&
        row.size === file.size &&
        row.mimeType === (file.type || 'application/octet-stream') &&
        row.hash === hash,
    );
    if (!intent) return false;
    files.set(intent.requestId, file);
    intent.status = 'queued';
    delete intent.error;
    this.save();
    return true;
  }
  removeFailed(requestId: string): void {
    if (!this.state || this.inflight?.state === this.state) return;
    this.state.files = this.state.files.filter(
      (file) => file.requestId !== requestId || file.status === 'attached',
    );
    this.files.delete(requestId);
    this.save();
  }
  bindTask(taskId: EntityId, key: string): void {
    if (this.state) {
      this.state.taskId = taskId;
      this.state.taskKey = key;
      this.save();
    }
  }
  clear(): void {
    this.state = null;
    this.files = new Map();
    this.save();
  }
  run(
    client: StudioClient,
    changed: () => void,
    invalidate: (taskId: EntityId) => Promise<void>,
  ): Promise<boolean> {
    const state = this.state;
    if (!state) return Promise.resolve(false);
    if (!state.prepared) return Promise.reject(new Error('File preparation has not completed'));
    if (this.inflight?.state === state) return this.inflight.promise;
    const files = this.files;
    const intentClient = captureIntent(client);
    const execute = async () => {
      if (!state.taskId) {
        const result = await intentClient.api.createTask({
          workspaceId: this.workspaceId,
          body: state.payload,
        });
        state.taskId = result.data.task.id;
        state.taskKey = result.data.task.key;
        if (this.state === state) this.save();
        changed();
        await invalidate(state.taskId);
      }
      for (const intent of state.files) {
        if (intent.status === 'attached') continue;
        const file = files.get(intent.requestId);
        if (!file) {
          intent.status = 'failed';
          intent.error = 'Select this file again to retry';
          if (this.state === state) this.save();
          changed();
          continue;
        }
        intent.status = 'uploading';
        delete intent.error;
        if (this.state === state) this.save();
        changed();
        try {
          const result = await intentClient.api.uploadProjectFile({
            workspaceId: this.workspaceId,
            projectId: state.payload.projectId,
            body: {
              taskId: state.taskId,
              clientRequestId: intent.requestId,
              file: {
                name: intent.name,
                mimeType: intent.mimeType,
                bytes: new Uint8Array(await file.arrayBuffer()),
              },
            },
          });
          intent.status = 'attached';
          intent.fileId = result.data.id;
        } catch (cause) {
          intent.status = 'failed';
          intent.error =
            cause instanceof Error ? cause.message : 'Attachment could not be confirmed';
        }
        if (this.state === state) this.save();
        changed();
        await invalidate(state.taskId);
      }
      return state.files.every((file) => file.status === 'attached');
    };
    const promise = execute().finally(() => {
      if (this.inflight?.state === state) this.inflight = null;
    });
    this.inflight = { state, promise };
    return promise;
  }
}

// Edit's canonical move and scalar PATCH are separate commands. Preserve each
// confirmed phase/version across partial failures; retry never repeats a move.
export class EditTaskCommit {
  private version: number;
  private moved = false;
  private patched = false;
  readonly taskId: TaskDto['id'];
  readonly originalProjectId: TaskDto['projectId'];
  constructor(task: Pick<TaskDto, 'id' | 'version' | 'projectId'>) {
    this.taskId = task.id;
    this.version = task.version;
    this.originalProjectId = task.projectId;
  }
  async save(
    client: StudioClient,
    workspaceId: string,
    projectId: TaskDto['projectId'],
    patch: Omit<UpdateTaskInput, 'expectedVersion'>,
    invalidated: () => Promise<void>,
  ) {
    const intentClient = captureIntent(client);
    if (!this.moved && projectId !== this.originalProjectId) {
      const result = await intentClient.api.moveTask({
        workspaceId,
        taskId: this.taskId,
        body: {
          expectedVersion: this.version,
          targetProjectId: projectId,
          scope: { sortField: 'manual', sortDirection: 'asc' },
        },
      });
      this.version = result.data.task.version;
      this.moved = true;
      await invalidated();
    }
    if (!this.patched) {
      const result = await intentClient.api.updateTask({
        workspaceId,
        taskId: this.taskId,
        body: { expectedVersion: this.version, ...patch },
      });
      this.version = result.data.task.version;
      this.patched = true;
      await invalidated();
    }
  }
}
