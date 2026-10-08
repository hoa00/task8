import { CreateTaskInputSchema, TaskMutationSchema } from '@studio/contracts';
import type { StudioApi, TaskDto } from '@studio/contracts';
export async function submit(api: StudioApi, input: unknown): Promise<TaskDto> {
  const body = CreateTaskInputSchema.parse(input);
  const result = await api.createTask({ workspaceId: '0199c5c9-2a80-7000-8000-000000000001', body });
  return TaskMutationSchema.parse(result.data).task;
}

export function checkClientTypes(api: StudioApi): void {
  // @ts-expect-error Mutations require the known entity version.
  void api.updateTask({ workspaceId: '0199c5c9-2a80-7000-8000-000000000001', taskId: '0199c5c9-2a80-7000-8000-000000000002', body: { title: 'New title' } });
  // @ts-expect-error Project movement is a separate command, never ordinary PATCH.
  void api.updateTask({ workspaceId: '0199c5c9-2a80-7000-8000-000000000001', taskId: '0199c5c9-2a80-7000-8000-000000000002', body: { expectedVersion: 1, projectId: '0199c5c9-2a80-7000-8000-000000000003' } });
  // @ts-expect-error Bulk completion requires a full column scope.
  void api.bulkMutateTasks({ workspaceId: '0199c5c9-2a80-7000-8000-000000000001', body: { operation: 'complete', items: [] } });
}
