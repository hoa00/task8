import type { MemberDto } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from './db/client.ts';
import type { AuthenticatedPrincipal as Principal } from './modules/members/index.ts';
import type { DiagnosticReporter } from './shared/diagnostics.ts';
import type { FileStorage } from './storage/r2.ts';
export type { AuthenticatedPrincipal as Principal } from './modules/members/index.ts';
export type ApiEnvironment = {
  Bindings: CloudflareBindings & AuthBindings;
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

export interface AuthBindings {
  AUTH_MODE?: string;
  AUTH_PROVIDER_BASE_URL?: string;
  AUTH_TENANT_ID?: string;
  AUTH_PROVIDER_KEY?: string;
  AUTH_PUBLIC_KEY?: string;
  AUTH_SESSION_ENCRYPTION_KEY?: string;
  AUTH_SESSION_MAX_AGE_SECONDS?: string;
  AUTH_APP_ORIGIN?: string;
}
