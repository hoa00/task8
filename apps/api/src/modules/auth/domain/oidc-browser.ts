import type { InitialOidcTokens } from './oidc.ts';
import { ApiFailure } from '../../../shared/errors.ts';

export interface LoginCommit {
  id: string;
  priorHash: string | null;
}
export interface LoginTransaction extends LoginCommit {
  stateHash: string;
  bindingHash: string;
  secret: string;
  issuer: string;
  clientId: string;
  redirectUri: string;
  returnTo: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'claimed' | 'succeeded' | 'failed';
}
export interface LoginSecret {
  nonce: string;
  verifier: string;
}
export interface OidcBrowserProvider {
  authorization(secret: LoginSecret, state: string): Promise<string>;
  exchange(
    search: string,
    secret: LoginSecret,
    state: string,
    ensureClaimed: () => Promise<void>,
  ): Promise<InitialOidcTokens>;
  logout(state: string): Promise<string>;
  revoke(refreshToken: string): Promise<void>;
}
export interface LoginCrypto {
  seal(id: string, secret: LoginSecret): Promise<string>;
  open(id: string, envelope: string): Promise<LoginSecret>;
}
export const transactionInvalid = () =>
  new ApiFailure('VALIDATION_ERROR', 'Sign-in did not complete. Please start again.');
export function returnPath(value: string | null): string {
  const path = value ?? '/';
  if (
    path.length > 2048 ||
    /[%\\#]/u.test(path) ||
    path.includes('//') ||
    [...path].some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127) ||
    !/^\/(?:$|w\/[a-f0-9-]{36}(?:\/[a-zA-Z0-9/_-]*)?(?:\?[^#]*)?$)/u.test(path)
  )
    throw transactionInvalid();
  return path;
}

export class UnlinkedIdentityFailure extends ApiFailure {
  constructor() {
    super('FORBIDDEN', 'Identity is not linked to a local account');
  }
}
