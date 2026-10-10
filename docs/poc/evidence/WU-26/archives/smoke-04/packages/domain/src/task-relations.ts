import type { MemberDto, ProjectDto, TaskDto } from '@studio/contracts/api';
export interface TaskRelationContext { workspaceId: string; currentMemberId: string; projects: Readonly<Record<string, ProjectDto>>; members: Readonly<Record<string, MemberDto>>; tasks: Readonly<Record<string, TaskDto>> }
export class TaskRelationError extends Error { readonly field: string; readonly reason: 'relation' | 'self' | 'cycle'; constructor(field: string, message: string, reason: 'relation' | 'self' | 'cycle' = 'relation') { super(message); this.reason = reason; this.name = 'TaskRelationError'; this.field = field; } }
export function canReadProject(project: ProjectDto | undefined, context: Pick<TaskRelationContext, 'workspaceId' | 'currentMemberId'>): project is ProjectDto { return !!project && project.workspaceId === context.workspaceId && (project.visibility !== 'private' || project.memberIds.some(id => id === context.currentMemberId)); }
export function validateTaskRelations(task: Pick<TaskDto, 'id' | 'workspaceId' | 'projectId' | 'assigneeId' | 'dependencyIds'>, context: TaskRelationContext): void {
  if (task.workspaceId !== context.workspaceId) throw new TaskRelationError('workspaceId', 'Task belongs to another workspace');
  const project = context.projects[task.projectId];
  if (!canReadProject(project, context) || project.archivedAt) throw new TaskRelationError('projectId', 'Choose an accessible active project in this workspace');
  if (task.assigneeId !== null) {
    const member = context.members[task.assigneeId];
    if (!member || member.workspaceId !== context.workspaceId) throw new TaskRelationError('assigneeId', 'Choose an active member in this workspace');
  }
  for (const id of task.dependencyIds) {
    const dependency = context.tasks[id];
    if (id === task.id) throw new TaskRelationError('dependencyIds', 'A task cannot depend on itself', 'self');
    if (!dependency || dependency.workspaceId !== context.workspaceId || dependency.archivedAt || !canReadProject(context.projects[dependency.projectId], context) || context.projects[dependency.projectId]!.archivedAt) throw new TaskRelationError('dependencyIds', 'Choose an accessible task in this workspace');
    const visited = new Set<string>();
    const reachesSelf = (current: string): boolean => { if (current === task.id) return true; if (visited.has(current)) return false; visited.add(current); return context.tasks[current]?.dependencyIds.some(reachesSelf) ?? false; };
    if (reachesSelf(id)) throw new TaskRelationError('dependencyIds', 'Dependencies cannot contain a cycle', 'cycle');
  }
}

export function changedDependencyTargets(before: readonly TaskDto['id'][], after: readonly TaskDto['id'][]): TaskDto['id'][] { return [...new Set([...before, ...after])].filter(id => before.includes(id) !== after.includes(id)); }
