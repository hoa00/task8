import { MemberSummarySchema, EntityIdSchema } from '@studio/contracts/api';
import { summarizeTasks } from '@studio/domain';
import type { Clock } from '@studio/domain';
import type { MockDataset } from './dataset.ts';
import { readDashboardScope } from './dashboards.ts';
import { projectCatalogItem } from './reads.ts';
import { StudioApiError } from '../errors.ts';
export const peopleReads = ['getMember', 'getMemberSummary'] as const;
export function readMember(data: MockDataset, memberId: unknown) { const actor = data.members[data.currentMemberId], member = data.members[EntityIdSchema.parse(memberId)]; if (!actor || actor.status !== 'active' || actor.workspaceId !== data.workspaceId || !member || member.workspaceId !== data.workspaceId) throw new StudioApiError({ error: { code: 'NOT_FOUND', message: 'Member not found' } }); return member; }
export function readMemberSummary(data: MockDataset, memberId: unknown, clock: Clock) { const member = readMember(data, memberId), scope = readDashboardScope(data), tasks = scope.tasks.filter(task => task.assigneeId === member.id), summary = summarizeTasks(tasks, clock.today()); return MemberSummarySchema.parse({ memberId: member.id, open: summary.total - summary.completed, done: summary.completed, overdue: summary.overdue, projects: scope.projects.filter(project => project.memberIds.includes(member.id) && project.status !== 'complete').map(project => projectCatalogItem(data, project, clock)) }); }
