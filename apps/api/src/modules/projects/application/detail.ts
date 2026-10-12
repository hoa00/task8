import type { RequestRepository, WorkspaceContext } from '../../../db/client.ts';
import { projectProjection } from '../mapper.ts';
import {
  projectDtoReadProjectFavorites,
  projectDtoReadProjectMembers,
  projectDtoReadProjectMilestones,
} from '../persistence/detail.ts';
import type { ProjectRow } from '../persistence/model.ts';
export async function projectDto(
  r: RequestRepository,
  s: WorkspaceContext,
  p: ProjectRow,
  now: number,
) {
  // A deleted root is returned only by its own command/restore response, with no private child leak.
  const grants = await projectDtoReadProjectMembers(r, s, p);
  const milestones = await projectDtoReadProjectMilestones(r, s, p);
  const fav = await projectDtoReadProjectFavorites(r, s, p);
  void now;
  return projectProjection(p, {
    memberIds: grants.map((g) => g.memberId),
    milestones: milestones,
    isFavorite: !!fav.length,
  });
}
