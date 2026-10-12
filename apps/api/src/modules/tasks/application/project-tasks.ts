import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { taskDto } from '../mapper.ts';
import { projectTaskRows } from '../persistence/active.ts';
export async function createdTaskDtos(
  r: RequestRepository,
  s: WorkspaceContext,
  p: { id: string },
) {
  return (await projectTaskRows(r, s, p.id)).map(taskDto);
}
