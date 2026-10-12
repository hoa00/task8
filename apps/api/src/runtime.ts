import type { MemberDto, UserProfileDto, EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from './db/repository.ts';
export interface Principal {
  user: UserProfileDto;
  currentWorkspaceId: EntityId;
}
export type ApiEnvironment = {
  Bindings: CloudflareBindings;
  Variables: {
    repository: RequestRepository;
    principal: Principal;
    workspace: WorkspaceContext;
    currentMember: MemberDto;
  };
};
