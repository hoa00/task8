import {
  ColumnScopeSchema,
  EntityIdSchema,
  InstantSchema,
  LabelIdSchema,
  SubtaskSchema,
  TaskStatusSchema,
  UndoResultSchema,
  VersionSchema,
} from '@studio/contracts/api';
import { z } from 'zod';
import { ApiFailure } from '../shared/errors.ts';
const identity = { id: EntityIdSchema, postVersion: VersionSchema };
const lifecycle = z.strictObject({
  ...identity,
  before: z.strictObject({
    archivedAt: InstantSchema.nullable(),
    deletedAt: InstantSchema.nullable(),
    deletedBy: EntityIdSchema.nullable(),
    updatedAt: InstantSchema,
  }),
});
const completion = z.strictObject({
  ...identity,
  before: z.strictObject({
    status: TaskStatusSchema,
    completedAt: InstantSchema.nullable(),
    previousStatus: TaskStatusSchema.nullable(),
    updatedAt: InstantSchema,
  }),
});
const association = z.strictObject({
  ...identity,
  entity: z.enum(['team', 'member', 'project']),
  before: z.strictObject({
    teamId: EntityIdSchema.nullable(),
    nameNormalized: z.string().max(240).nullable(),
    archivedAt: InstantSchema.nullable(),
    deletedAt: InstantSchema.nullable(),
    removedAt: InstantSchema.nullable(),
    status: z.enum(['active', 'invited']).optional(),
    deletedBy: EntityIdSchema.nullable().optional(),
  }),
});
const base = { activityIds: z.array(EntityIdSchema).max(128) };
export const undoPayloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...base,
    kind: z.literal('task.complete'),
    targets: z.array(completion).length(1),
  }),
  ...(['task.archive', 'task.delete', 'project.archive', 'project.delete'] as const).map((kind) =>
    z.strictObject({ ...base, kind: z.literal(kind), targets: z.array(lifecycle).length(1) }),
  ),
  z.strictObject({
    ...base,
    kind: z.literal('file.delete'),
    targets: z
      .array(
        lifecycle.extend({
          projectId: EntityIdSchema,
          taskId: EntityIdSchema.nullable(),
          parentPostVersion: VersionSchema,
        }),
      )
      .length(1),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('comment.delete'),
    targets: z
      .array(lifecycle.extend({ taskId: EntityIdSchema, taskPostVersion: VersionSchema }))
      .length(1),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('tasks.bulkDelete'),
    targets: z.array(lifecycle).min(1).max(128),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('tasks.archiveCompletedColumn'),
    columnScope: ColumnScopeSchema,
    targets: z.array(lifecycle).max(128),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('tasks.completeColumn'),
    columnScope: ColumnScopeSchema,
    targets: z
      .array(
        z.discriminatedUnion('entity', [
          completion.extend({ entity: z.literal('parent') }),
          z.strictObject({
            ...identity,
            entity: z.literal('successor'),
            parentId: EntityIdSchema,
            children: z
              .array(
                SubtaskSchema.omit({ taskId: true }).extend({
                  done: z.boolean(),
                  createdAt: z.number().int(),
                  updatedAt: z.number().int(),
                }),
              )
              .max(128),
            labelIds: z.array(LabelIdSchema).max(20),
            dependencyIds: z.array(EntityIdSchema).max(128),
          }),
          z.strictObject({ ...identity, entity: z.literal('dependency') }),
        ]),
      )
      .min(1)
      .max(128),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('team.delete'),
    targets: z.array(association).min(1).max(128),
  }),
]);
export function encodeUndoPayload(input: unknown) {
  const payload = undoPayloadSchema.parse(input),
    json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).byteLength > 65536)
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Undo payload exceeds limit');
  return json;
}
export function decodeUndoPayload(json: string) {
  if (new TextEncoder().encode(json).byteLength > 65536)
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Undo payload exceeds limit');
  return undoPayloadSchema.parse(JSON.parse(json));
}
export function encodeUndoResult(input: unknown) {
  return JSON.stringify(UndoResultSchema.parse(input));
}
export function decodeUndoResult(json: string) {
  return UndoResultSchema.parse(JSON.parse(json));
}
