import { catalogs, MemberSchema, WorkspaceSchema } from '@studio/contracts/api';
import { newMockId } from './task-fields.ts';
import { createSeedDataset } from './seed.ts';
import { MockDatasetSchema, assertDatasetRelations } from './dataset.ts';
import { runProjectOperation } from './projects.ts';
import { onboardingViews } from '../onboarding-demo.ts';
import type { OnboardingDraft } from '../onboarding-demo.ts';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';

// A fresh scope contains only its principal and template entities, never copies
// projects/tasks/members from the previously selected workspace.
export async function createOnboardingDataset(draft: OnboardingDraft, clock: Clock, principalDataset: MockDataset = createSeedDataset(clock)): Promise<MockDataset> {
  const seed = principalDataset, workspaceId = draft.flowId, currentMemberId = newMockId(clock);
  const actor = seed.members[seed.currentMemberId]!;
  const workspace = WorkspaceSchema.parse({ ...seed.workspaces[seed.workspaceId], id: workspaceId, name: draft.ws.trim(), slug: draft.url || 'workspace', planLabel: 'Free', iconColor: '#C54B78', version: 1 });
  const member = MemberSchema.parse({ ...actor, id: currentMemberId, workspaceId, teamId: null, role: 'Owner' });
  const dataset = MockDatasetSchema.parse({ ...seed, workspaceId, currentMemberId, workspaces: { [workspaceId]: workspace }, users: { [actor.userId]: seed.users[actor.userId] }, members: { [currentMemberId]: member }, teams: {}, projects: {}, tasks: {}, subtasks: {}, comments: {}, files: {}, activity: {}, notifications: {}, events: {}, savedViews: {}, taskCommands: undefined, projectCommands: undefined, teamCommands: undefined, projectOrder: [], preferences: { ...seed.preferences, defaultTab: onboardingViews[draft.team] } });
  await runProjectOperation('createProject', { workspaceId, body: { name: draft.proj.trim(), description: `Created during setup from the ${catalogs.templates.find(row => row.id === draft.tmpl)!.name} template.`, icon: 'folder', color: '#5A67D8', teamId: null, leadId: currentMemberId, dueDate: null, templateId: draft.tmpl } }, dataset, clock);
  dataset.onboardingReceipt = { flowId: workspaceId, projectId: dataset.projectOrder[0]! };
  dataset.taskCommands.taskFavorites[currentMemberId] = [];
  dataset.projectCommands.favorites[currentMemberId] = [];
  assertDatasetRelations(dataset);
  return dataset;
}
