import {
  MemberPreferencesSchema,
  NotificationPreferencesSchema,
  UpdateNotificationPreferencesInputSchema,
  UpdatePreferencesInputSchema,
  UpdateProfileInputSchema,
  UpdateWorkspaceInputSchema,
  UserProfileSchema,
  WorkspaceSchema,
} from '@studio/contracts/api';
import type { OperationId } from '@studio/contracts/api';
import type { Clock } from '@studio/domain';
import { StudioApiError } from '../errors.ts';
import type { MockDataset } from './dataset.ts';
import { transactMock } from './transaction.ts';

export const settingsOperations = [
  'updateWorkspace',
  'updateProfile',
  'updatePreferences',
  'updateNotificationPreferences',
] as const satisfies readonly OperationId[];
function fail(
  code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL_ERROR',
  message: string,
): never {
  throw new StudioApiError({ error: { code, message } });
}
// Use the same staged queue as task/project/team commands. Persistence must succeed
// before committing memory, including the canonical profile/membership projection.
export function runSettingsOperation(
  id: OperationId,
  input: Record<string, unknown>,
  data: MockDataset,
  clock: Clock,
  persist?: (staged: MockDataset) => boolean,
) {
  return transactMock(data, async (staged) => {
    const member = staged.members[staged.currentMemberId];
    if (
      !member ||
      member.workspaceId !== staged.workspaceId ||
      member.status !== 'active' ||
      !staged.users[member.userId]
    )
      return fail('NOT_FOUND', 'Current workspace membership is unavailable');
    if (input.workspaceId && input.workspaceId !== staged.workspaceId)
      return fail('NOT_FOUND', 'Workspace data is not available');
    let result;
    if (id === 'updateWorkspace') {
      if (!['Owner', 'Admin'].includes(member.role))
        return fail('FORBIDDEN', 'Only workspace administrators can change workspace settings');
      const { expectedVersion, ...patch } = UpdateWorkspaceInputSchema.parse(input.body),
        current = staged.workspaces[staged.workspaceId]!;
      if (current.version !== expectedVersion)
        return fail('CONFLICT', 'Workspace settings changed. Refresh and try again.');
      const workspace = WorkspaceSchema.parse({
        ...current,
        ...patch,
        version: current.version + 1,
        updatedAt: clock.now(),
      });
      staged.workspaces[workspace.id] = workspace;
      result = { data: workspace };
    } else if (id === 'updateProfile') {
      const { expectedVersion, ...patch } = UpdateProfileInputSchema.parse(input.body),
        current = staged.users[member.userId]!;
      if (current.version !== expectedVersion)
        return fail('CONFLICT', 'Your profile changed. Refresh and try again.');
      const profile = UserProfileSchema.parse({
        ...current,
        ...patch,
        version: current.version + 1,
      });
      staged.users[profile.id] = profile;
      for (const membership of Object.values(staged.members))
        if (membership.userId === profile.id)
          staged.members[membership.id] = {
            ...membership,
            name: profile.name,
            title: profile.title,
            avatarColor: profile.avatarColor,
            version: membership.version + 1,
          };
      result = { data: profile };
    } else if (id === 'updatePreferences') {
      staged.preferences = MemberPreferencesSchema.parse({
        ...staged.preferences,
        ...UpdatePreferencesInputSchema.parse(input.body),
      });
      result = { data: staged.preferences };
    } else if (id === 'updateNotificationPreferences') {
      staged.notificationPreferences = NotificationPreferencesSchema.parse({
        ...staged.notificationPreferences,
        ...UpdateNotificationPreferencesInputSchema.parse(input.body),
      });
      result = { data: staged.notificationPreferences };
    } else return fail('NOT_FOUND', 'Settings operation is unavailable');
    if (persist && !persist(staged))
      return fail('INTERNAL_ERROR', 'Settings could not be saved. Your draft is unchanged.');
    return result;
  });
}
