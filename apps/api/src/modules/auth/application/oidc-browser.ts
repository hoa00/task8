import type { RequestRepository } from '../../../db/client.ts';
import type { Clock } from '../../../shared/clock.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import type { OidcCrypto } from '../domain/oidc.ts';
import { oidcPolicy } from '../domain/oidc.ts';
import {
  returnPath,
  transactionInvalid,
  type LoginCrypto,
  type OidcBrowserProvider,
} from '../domain/oidc-browser.ts';
import type { OidcSessionService } from './oidc-session.ts';
import { oidcBrowserStore } from '../persistence/oidc-browser.ts';
import { oidcSessionStore } from '../persistence/oidc-session.ts';
export interface OidcBrowserDependencies {
  repository: RequestRepository;
  clock: Clock;
  generateId: IdGenerator;
  crypto: OidcCrypto;
  loginCrypto: LoginCrypto;
  provider: OidcBrowserProvider;
  sessions: OidcSessionService;
  issuer: string;
  clientId: string;
  origin: string;
}
export function createOidcBrowserService(deps: OidcBrowserDependencies) {
  const store = oidcBrowserStore(deps.repository, deps),
    sessions = oidcSessionStore(deps.repository, deps.issuer, deps.clientId);
  const digest = (sid: string | undefined) =>
    sid ? deps.crypto.hashSid(sid) : Promise.resolve(null);
  return {
    async begin(value: string | null, priorSid: string | undefined) {
      const destination = returnPath(value),
        priorHash = await digest(priorSid);
      if (priorHash && (await sessions.current(priorHash))) throw transactionInvalid();
      const id = deps.generateId(),
        state = deps.crypto.newSid(),
        binding = deps.crypto.newSid(),
        secret = { nonce: deps.crypto.newSid(), verifier: deps.crypto.newSid() };
      const redirect = await deps.provider.authorization(secret, state),
        now = deps.clock.now();
      await store.insert({
        id,
        stateHash: await deps.crypto.hashSid(state),
        bindingHash: await deps.crypto.hashSid(binding),
        secret: await deps.loginCrypto.seal(id, secret),
        issuer: deps.issuer,
        clientId: deps.clientId,
        redirectUri: deps.origin + '/auth/callback',
        returnTo: destination,
        priorHash,
        createdAt: now,
        expiresAt: now + oidcPolicy.transaction * 1000,
        status: 'pending',
      });
      return { binding, redirect };
    },
    async callback(
      search: string,
      state: string,
      binding: string | undefined,
      priorSid: string | undefined,
      denied: boolean,
    ) {
      if (!binding || !/^[A-Za-z0-9_-]{43}$/u.test(state)) throw transactionInvalid();
      const row = await store.claim(
        await deps.crypto.hashSid(state),
        await deps.crypto.hashSid(binding),
        await digest(priorSid),
      );
      try {
        if (denied) throw transactionInvalid();
        const secret = await deps.loginCrypto.open(row.id, row.secret);
        if (!(await store.claimed(row.id))) throw transactionInvalid();
        const tokens = await deps.provider.exchange(search, secret, state, async () => {
          if (!(await store.claimed(row.id))) throw transactionInvalid();
        });
        const result = await deps.sessions.create(tokens, secret.nonce, {
          id: row.id,
          priorHash: row.priorHash,
        });
        return { ...result, returnTo: row.returnTo };
      } catch (error) {
        await store.fail(row.id);
        throw error;
      }
    },
    async logout(sid: string | undefined, provider: boolean) {
      const hash = await digest(sid),
        row = hash ? await sessions.current(hash) : undefined;
      // Local revocation finishes before decryption, discovery, revocation or provider navigation.
      await deps.sessions.revoke(sid);
      let redirect: string | null = null,
        binding: string | null = null;
      if (row) {
        try {
          const tokens = await deps.crypto.open(row, row.bundle);
          if (provider) {
            const state = deps.crypto.newSid();
            binding = deps.crypto.newSid();
            redirect = await deps.provider.logout(state);
            await store.logout(
              await deps.crypto.hashSid(state),
              await deps.crypto.hashSid(binding),
              deps.clock.now() + oidcPolicy.transaction * 1000,
            );
          }
          await deps.provider.revoke(tokens.refresh_token).catch(() => undefined);
        } catch {
          /* Upstream failure cannot undo local revocation. */
        }
      }
      return { redirect, binding };
    },
    async complete(state: string, binding: string | undefined) {
      if (
        !binding ||
        !/^[A-Za-z0-9_-]{43}$/u.test(state) ||
        !(await store.complete(
          await deps.crypto.hashSid(state),
          await deps.crypto.hashSid(binding),
          deps.clock.now(),
        ))
      )
        throw transactionInvalid();
    },
  };
}

export { transactionInvalid, UnlinkedIdentityFailure } from '../domain/oidc-browser.ts';
export type { OidcBrowserProvider } from '../domain/oidc-browser.ts';
export { oidcPolicy } from '../domain/oidc.ts';
