import { canReadProject } from '@studio/domain';
import type { ProjectDto } from '@studio/contracts/api';
import type { MockDataset } from './dataset.ts';
export function canReadMockProject(project: ProjectDto | undefined, data: MockDataset): project is ProjectDto {
  return canReadProject(project, data) && !data.projectCommands.deletedProjects[project.id];
}
