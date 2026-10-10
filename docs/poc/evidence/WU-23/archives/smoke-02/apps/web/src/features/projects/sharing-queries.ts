import { useQuery } from '@tanstack/react-query';
import type { BootstrapDto, ProjectDto } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { useStudioQuery } from '../../data/queries';
import { useCompleteMembers } from './catalogue';

// Header/menu exposure owns these reads, before the dialog consumes them. The
// same canonical keys also support a cold dialog, with its truthful loading UI.
export function useProjectSharing(project: ProjectDto, data: BootstrapDto) {
  const { sharingDemo } = useDataRuntime();
  const members = useStudioQuery('listProjectMembers', { workspaceId: project.workspaceId, projectId: project.id });
  const catalog = useCompleteMembers(project.workspaceId);
  const session = useStudioQuery('getSession', {});
  const key = ['workspace', project.workspaceId, 'demo-sharing', data.currentMember.id, project.id];
  const demo = useQuery({
    queryKey: key,
    enabled: !!members.data && !!sharingDemo && session.data?.data.capabilities.features.projectSharing === 'demoOnly',
    queryFn: () => sharingDemo!.read(project, members.data!.data.map(row => row.member), data.currentMember.id),
  });
  return { members, catalog, session, demo, key };
}
