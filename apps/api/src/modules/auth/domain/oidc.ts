import type { EntityId } from '@studio/contracts/api';

export const oidcPolicy = Object.freeze({
  absolute: 28800,
  freshness: 300,
  access: 300,
  transaction: 600,
  tolerance: 60,
  recovery: 30,
  timeout: 5,
  lease: 10,
});
export interface OidcBinding {
  id: EntityId;
  linkId: EntityId;
  issuer: string;
  subject: string;
  clientId: string;
  providerSid: string;
}
export interface OidcTokens {
  access_token: string;
  refresh_token: string;
  id_token?: string;
}
export interface InitialOidcTokens extends OidcTokens {
  id_token: string;
  expires_in: number;
}
export interface VerifiedOidcIdentity {
  subject: string;
  sid: string;
}
export interface OidcProvider {
  initial(tokens: InitialOidcTokens, nonce: string): Promise<VerifiedOidcIdentity>;
  refresh(tokens: OidcTokens): Promise<OidcTokens & { expires_in: number }>;
  active(tokens: OidcTokens, identity: VerifiedOidcIdentity): Promise<boolean>;
}
export type RefreshRejection = 'terminal' | 'non-consuming' | 'unknown';
export class OidcRefreshFailure extends Error {
  constructor(readonly kind: RefreshRejection) {
    super('OIDC refresh unavailable');
    this.name = 'OidcRefreshFailure';
  }
}
export interface OidcCrypto {
  newSid(): string;
  hashSid(sid: string): Promise<string>;
  seal(binding: OidcBinding, tokens: OidcTokens): Promise<string>;
  open(binding: OidcBinding, envelope: string): Promise<OidcTokens>;
}
export interface OidcSessionRecord extends OidcBinding {
  sidHash: string;
  userId: EntityId;
  bundle: string;
  createdAt: number;
  expiresAt: number;
  authorityValidatedAt: number;
  accessExpiresAt: number;
  revokedAt: number | null;
  revision: number;
  leaseOwner: string | null;
  leaseUntil: number;
  refreshInput: string | null;
  refreshAttemptAt: number;
}
