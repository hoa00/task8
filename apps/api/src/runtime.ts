import type { MemberDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from './db/client.ts';
import type { AuthenticatedPrincipal as Principal } from './modules/members/index.ts';
import type { DiagnosticReporter } from './shared/diagnostics.ts';
import type { FileStorage } from './storage/r2.ts';
export type { AuthenticatedPrincipal as Principal } from './modules/members/index.ts';
export type ApiEnvironment = {
  Bindings: CloudflareBindings;
  Variables: {
    requestId: string;
    requestStartedAt: number;
    operation: string;
    repository: RequestRepository;
    fileStorage: FileStorage;
    diagnostics: DiagnosticReporter;
    principal: Principal;
    workspace: WorkspaceContext;
    currentMember: MemberDto;
  };
};
