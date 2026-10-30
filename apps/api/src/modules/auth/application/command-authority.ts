import { EntityIdSchema } from '@studio/contracts/api';
import type { RequestRepository } from '../../../db/client.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { CommandAuthority } from '../../../shared/scope.ts';
import type { AuthenticatedPrincipal } from '../../members/index.ts';
import { currentCommandAuthority } from '../persistence/command-authority.ts';
export function commandAuthority(
  mode: string | undefined,
  principal: AuthenticatedPrincipal,
): CommandAuthority {
  const invalid = () =>
    new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Verified command authority is required');
  if (mode === 'local' && principal.authSession === null && !principal.authentication)
    return { kind: 'local' };
  if (mode === 'ict24h' && principal.authSession && !principal.authentication)
    return { kind: 'ict24h' };
  const identity = principal.authentication;
  if (
    mode !== 'oidc' ||
    identity?.mechanism !== 'oidc' ||
    !principal.authSession ||
    identity.sessionId !== principal.authSession.id ||
    !EntityIdSchema.safeParse(identity.sessionId).success ||
    !EntityIdSchema.safeParse(principal.user.id).success ||
    !identity.issuer ||
    !identity.clientId
  )
    throw invalid();
  return {
    kind: 'oidc',
    sessionId: identity.sessionId,
    userId: principal.user.id,
    issuer: identity.issuer,
    clientId: identity.clientId,
  };
}
export function commandAuthorityStatus(repository: RequestRepository, authority: CommandAuthority) {
  return currentCommandAuthority(repository, authority);
}
