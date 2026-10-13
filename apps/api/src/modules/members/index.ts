export { membership, principal, resolveProfile } from './application/identity.ts';
export type { AuthenticatedPrincipal } from './application/identity.ts';

export { member, members } from './application/directory.ts';
export { listMembers, memberSummary } from './application/member-queries.ts';
export { updateProfile } from './application/profile.ts';
export { ensureExternalProfile, explicitlyLinkIdentity } from './application/external-identity.ts';
export type {
  ExternalProfile,
  ExternalIdentityProfile,
  IdentityDependencies,
  LinkIdentityInput,
} from './application/external-identity.ts';
