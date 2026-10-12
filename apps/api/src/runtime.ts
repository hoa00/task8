import type { MemberDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from './db/client.ts';
import type { AuthenticatedPrincipal as Principal } from './modules/members/index.ts';
export type { AuthenticatedPrincipal as Principal } from './modules/members/index.ts';
export type ApiEnvironment = {
  Bindings: CloudflareBindings;
  Variables: {
    requestId: string;
    requestStartedAt: number;
    operation: string;
    repository: RequestRepository;
    principal: Principal;
    workspace: WorkspaceContext;
    currentMember: MemberDto;
  };
};
