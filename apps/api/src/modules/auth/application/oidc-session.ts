import { UnlinkedIdentityFailure, type LoginCommit } from '../domain/oidc-browser.ts';
import {
  AuthSessionMetadataSchema,
  type EntityId,
  type AuthSessionMetadata,
} from '@studio/contracts/api';
import type { RequestRepository } from '../../../db/client.ts';
import type { Clock } from '../../../shared/clock.ts';
import { instant } from '../../../shared/clock.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import { resolveProfile, type AuthenticatedPrincipal } from '../../members/index.ts';
import { defaultWorkspaceId } from '../../workspaces/index.ts';
import {
  oidcPolicy,
  OidcRefreshFailure,
  type InitialOidcTokens,
  type OidcCrypto,
  type OidcProvider,
  type OidcSessionRecord,
} from '../domain/oidc.ts';
import { oidcSessionStore } from '../persistence/oidc-session.ts';
const invalid = () => new ApiFailure('UNAUTHENTICATED', 'Authentication required');
const unavailable = () =>
  new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable');
export interface OidcSessionDependencies {
  repository: RequestRepository;
  clock: Clock;
  generateId: IdGenerator;
  provider: OidcProvider;
  crypto: OidcCrypto;
  issuer: string;
  clientId: string;
}
export interface OidcPrincipal extends AuthenticatedPrincipal {
  authSession: AuthSessionMetadata;
  authentication: {
    mechanism: 'oidc';
    issuer: string;
    clientId: string;
    subject: string;
    linkId: EntityId;
    sessionId: EntityId;
    authenticatedAt: number;
    authorityValidatedAt: number;
  };
}
export interface OidcSessionService {
  create(
    tokens: InitialOidcTokens,
    nonce: string,
    commit?: LoginCommit,
  ): Promise<{ sid: string; expiresAt: number }>;
  authenticate(
    sid: string | undefined,
  ): Promise<{ record: OidcSessionRecord; principal: OidcPrincipal }>;
  revoke(sid: string | undefined): Promise<boolean>;
}
export function createOidcSessionService(deps: OidcSessionDependencies): OidcSessionService {
  const store = oidcSessionStore(deps.repository, deps.issuer, deps.clientId);
  const hash = async (sid: string | undefined) =>
    sid && /^[A-Za-z0-9_-]{43}$/u.test(sid) ? deps.crypto.hashSid(sid) : undefined;
  async function current(digest: string) {
    return store.current(digest);
  }
  async function conflict(digest: string): Promise<never> {
    if (!(await current(digest))) throw invalid();
    throw unavailable();
  }
  async function validate(digest: string) {
    const session = await current(digest);
    if (!session) throw invalid();
    await deps.crypto.open(session, session.bundle);
    const started = deps.clock.now();
    if (
      session.authorityValidatedAt <= started &&
      started - session.authorityValidatedAt < oidcPolicy.freshness * 1000
    )
      return session;
    const owner = deps.generateId(),
      claimed = await store.claim(session, owner);
    if (!claimed) return conflict(digest);
    const inherited = claimed.refreshInput !== null;
    let marked = claimed;
    async function revoke(row: OidcSessionRecord): Promise<never> {
      if (!(await store.revokeOwned(row, owner, deps.clock.now()))) return conflict(digest);
      throw invalid();
    }
    if (
      inherited &&
      (deps.clock.now() < claimed.refreshAttemptAt ||
        deps.clock.now() - claimed.refreshAttemptAt > oidcPolicy.recovery * 1000)
    )
      return revoke(claimed);
    if (!inherited) {
      const result = await store.mark(claimed, owner);
      if (!result) return conflict(digest);
      marked = result;
    }
    if (!marked.refreshInput) return conflict(digest);
    try {
      const original = await deps.crypto.open(marked, marked.refreshInput);
      let next;
      try {
        next = await deps.provider.refresh(original);
      } catch (error) {
        if (error instanceof OidcRefreshFailure && error.kind === 'terminal') return revoke(marked);
        const clear =
          error instanceof OidcRefreshFailure && error.kind === 'non-consuming' && !inherited;
        if (!(await store.release(marked, owner, clear))) return conflict(digest);
        throw unavailable();
      }
      if (!(await deps.provider.active(next, { sid: marked.providerSid, subject: marked.subject })))
        return revoke(marked);
      const now = deps.clock.now();
      if (
        !Number.isFinite(next.expires_in) ||
        next.expires_in <= 0 ||
        next.expires_in > oidcPolicy.access ||
        now < started ||
        now - started >= oidcPolicy.freshness * 1000
      )
        throw unavailable();
      const { expires_in: expiresIn, ...tokens } = next;
      const committed = await store.commit(
        marked,
        owner,
        await deps.crypto.seal(marked, tokens),
        started,
        started + expiresIn * 1000,
      );
      if (!committed) return conflict(digest);
      return committed;
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw unavailable();
    }
  }
  async function projection(row: OidcSessionRecord): Promise<OidcPrincipal> {
    const user = await resolveProfile(deps.repository, row.userId);
    return {
      user,
      currentWorkspaceId: await defaultWorkspaceId(deps.repository, row.userId),
      authSession: AuthSessionMetadataSchema.parse({
        id: row.id,
        accessExpiresAt: instant(row.accessExpiresAt),
        expiresAt: instant(row.expiresAt),
      }),
      authentication: {
        mechanism: 'oidc',
        issuer: row.issuer,
        clientId: row.clientId,
        subject: row.subject,
        linkId: row.linkId,
        sessionId: row.id,
        authenticatedAt: row.createdAt,
        authorityValidatedAt: row.authorityValidatedAt,
      },
    };
  }
  return {
    async create(tokens, nonce, commit) {
      const started = deps.clock.now(),
        identity = await deps.provider.initial(tokens, nonce),
        link = await store.link(identity.subject);
      if (!link) throw new UnlinkedIdentityFailure();
      const now = deps.clock.now();
      if (now < started || now - started >= oidcPolicy.freshness * 1000) throw unavailable();
      const sid = deps.crypto.newSid();
      const row: OidcSessionRecord = {
        id: deps.generateId(),
        linkId: link.id,
        userId: link.userId,
        issuer: deps.issuer,
        subject: identity.subject,
        clientId: deps.clientId,
        providerSid: identity.sid,
        sidHash: await deps.crypto.hashSid(sid),
        bundle: '',
        createdAt: now,
        expiresAt: now + oidcPolicy.absolute * 1000,
        authorityValidatedAt: started,
        accessExpiresAt: started + tokens.expires_in * 1000,
        revokedAt: null,
        revision: 1,
        leaseOwner: null,
        leaseUntil: 0,
        refreshInput: null,
        refreshAttemptAt: 0,
      };
      row.bundle = await deps.crypto.seal(row, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        id_token: tokens.id_token,
      });
      if (!(await store.insert(row, commit))) throw invalid();
      return { sid, expiresAt: row.expiresAt };
    },
    async authenticate(sid) {
      const digest = await hash(sid);
      if (!digest) throw invalid();
      const row = await validate(digest),
        latest = await current(digest);
      if (
        !latest ||
        latest.revision !== row.revision ||
        latest.authorityValidatedAt > deps.clock.now() ||
        deps.clock.now() - latest.authorityValidatedAt >= oidcPolicy.freshness * 1000
      )
        return conflict(digest);
      return { record: latest, principal: await projection(latest) };
    },
    async revoke(sid) {
      const digest = await hash(sid);
      return digest ? !!(await store.revoke(digest, deps.clock.now())) : false;
    },
  };
}
