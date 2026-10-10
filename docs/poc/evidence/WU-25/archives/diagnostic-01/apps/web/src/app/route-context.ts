import { notFound } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { EntityIdSchema } from '@studio/contracts/api';
import { studioQueryOptions } from '../data/queries';
import type { DataRuntime } from '../data/runtime';
import { StudioApiError } from '../data/errors';

export interface StudioRouterContext { runtime: DataRuntime; queryClient: QueryClient; navigation: { workspaceId: string | null } }
export interface WorkspaceRouteContext extends StudioRouterContext { workspaceId: string }
export function validId(id: string): string {
  if (!EntityIdSchema.safeParse(id).success) throw notFound();
  return id;
}
export async function resolveWorkspace(context: StudioRouterContext, workspaceId?: string) {
  const session = await context.queryClient.ensureQueryData(studioQueryOptions(context.runtime.client, 'getSession', {}));
  const id = validId(workspaceId ?? session.data.currentWorkspaceId);
  try { await context.queryClient.ensureQueryData(studioQueryOptions(context.runtime.client, 'getBootstrap', { workspaceId: id })); }
  catch (error) { if (error instanceof StudioApiError && error.status === 404) throw notFound(); throw error; }
  return id;
}
export async function bootstrap(context: WorkspaceRouteContext) {
  return (await context.queryClient.ensureQueryData(studioQueryOptions(context.runtime.client, 'getBootstrap', { workspaceId: context.workspaceId }))).data;
}
export async function validateProject(context: WorkspaceRouteContext, projectId: string) {
  validId(projectId);
  const item = (await bootstrap(context)).projects.find(item => item.project.id === projectId);
  if (!item) throw notFound();
  return item;
}
