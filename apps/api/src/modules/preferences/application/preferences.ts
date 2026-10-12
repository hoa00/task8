import type {
  MemberPreferencesDto,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesInput,
  UpdatePreferencesInput,
} from '@studio/contracts/api';
import { MemberPreferencesSchema, NotificationPreferencesSchema } from '@studio/contracts/api';
import { z } from 'zod';
import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import {
  preferencesCommitMemberPreferences,
  preferencesReadMemberPreferences,
} from '../persistence/preferences.ts';
const ValueRowSchema = z.object({ value: z.string() });
type PreferenceColumn = 'preferencesJson' | 'notificationPreferencesJson';
async function readDocument(
  repository: RequestRepository,
  scope: WorkspaceContext,
  column: PreferenceColumn,
): Promise<unknown> {
  const [row] = await preferencesReadMemberPreferences(repository, column, scope);
  if (!row) throw new ApiFailure('NOT_FOUND', 'Preferences not found');
  return JSON.parse(ValueRowSchema.parse(row).value);
}
async function updateDocument(
  repository: RequestRepository,
  scope: WorkspaceContext,
  column: PreferenceColumn,
  patch: UpdatePreferencesInput | UpdateNotificationPreferencesInput,
  now: number,
): Promise<unknown> {
  const results = await preferencesCommitMemberPreferences(repository, column, patch, now, scope);
  if (required(results[0], 'Missing preference update result').meta.changes !== 1)
    throw new ApiFailure('CONFLICT', 'Preference membership changed');
  const row = required(results[1], 'Missing preference read result').results[0];
  if (!row) throw new ApiFailure('NOT_FOUND', 'Preferences not found');
  return JSON.parse(ValueRowSchema.parse(row).value);
}
export async function readPreferences(
  repository: RequestRepository,
  scope: WorkspaceContext,
): Promise<MemberPreferencesDto> {
  return MemberPreferencesSchema.parse(await readDocument(repository, scope, 'preferencesJson'));
}
export async function readNotificationPreferences(
  repository: RequestRepository,
  scope: WorkspaceContext,
): Promise<NotificationPreferencesDto> {
  return NotificationPreferencesSchema.parse(
    await readDocument(repository, scope, 'notificationPreferencesJson'),
  );
}
export async function updatePreferences(
  repository: RequestRepository,
  scope: WorkspaceContext,
  patch: UpdatePreferencesInput,
  now: number,
): Promise<MemberPreferencesDto> {
  return MemberPreferencesSchema.parse(
    await updateDocument(repository, scope, 'preferencesJson', patch, now),
  );
}
export async function updateNotificationPreferences(
  repository: RequestRepository,
  scope: WorkspaceContext,
  patch: UpdateNotificationPreferencesInput,
  now: number,
): Promise<NotificationPreferencesDto> {
  return NotificationPreferencesSchema.parse(
    await updateDocument(repository, scope, 'notificationPreferencesJson', patch, now),
  );
}
