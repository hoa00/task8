import { ColorDot } from '@studio/ui';
import type { ProjectDto } from '@studio/contracts/api';
export interface ProjectIdentityProps { project: Pick<ProjectDto, 'name' | 'color'> }
export function ProjectIdentity({ project }: ProjectIdentityProps) { return <><ColorDot className="size-2! rounded-[3px]!" color={project.color} /><span className="truncate">{project.name}</span></>; }
