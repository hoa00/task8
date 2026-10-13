import {
  Ict24hSessionSchema,
  Ict24hCapabilitiesSchema,
  type AuthLoginInput,
  type Ict24hSessionDto,
  type EntityId,
} from '@studio/contracts/api';
import type { RequestRepository } from '../../../db/client.ts';
import { apiCapabilities } from '../../../shared/capabilities.ts';
import type { Clock } from '../../../shared/clock.ts';
import { instant } from '../../../shared/clock.ts';
import { ApiFailure, required } from '../../../shared/errors.ts';
import type { IdGenerator } from '../../../shared/ids.ts';
import { ensureExternalProfile, resolveProfile } from '../../members/index.ts';
import { defaultWorkspaceId } from '../../workspaces/index.ts';
import { requireSession, requireExpectedSession, type SessionRecord } from '../domain/session.ts';
import {
  findSession,
  insertSession,
  replacePair,
  revokeSession,
  type EncryptedPair,
} from '../persistence/session.ts';
import type { AccessVerifier, VerifiedAccess } from './access.ts';
import type { SessionCrypto } from '../domain/crypto.ts';
import type { IdentityProvider, ProviderProfile, ProviderTokens } from './provider.ts';

export interface SessionDependencies {
  repository: RequestRepository;
  clock: Clock;
  generateId: IdGenerator;
  provider: IdentityProvider;
  verifier: AccessVerifier;
  crypto: SessionCrypto;
  tenantId: string;
  maxAgeSeconds: number;
}
export interface AuthSessionService {
  login(
    input: AuthLoginInput,
    previousSid?: string,
  ): Promise<{ session: Ict24hSessionDto; sid: string }>;
  refresh(sid: string | undefined, expectedId?: string): Promise<Ict24hSessionDto>;
  logout(sid: string | undefined, expectedId?: string): Promise<{ signedOut: true }>;
  authenticate(
    sid: string | undefined,
  ): Promise<{ record: SessionRecord; session: Ict24hSessionDto }>;
}
const unavailable = () =>
  new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable');
const invalid = () => new ApiFailure('UNAUTHENTICATED', 'Authentication required');
const ict24hCapabilities = Ict24hCapabilitiesSchema.parse({
  ...apiCapabilities,
  identityMode: 'ict24h',
  features: { ...apiCapabilities.features, authentication: 'implemented' },
});

export function createSessionService(deps: SessionDependencies): AuthSessionService {
  const { repository, clock, generateId, provider, verifier } = deps;
  async function lookup(sid: string | undefined) {
    if (!sid || !/^[A-Za-z0-9_-]{43}$/u.test(sid)) return undefined;
    return findSession(repository, 'sidHash', await deps.crypto.hashSid(sid));
  }
  async function verified(tokens: ProviderTokens): Promise<VerifiedAccess> {
    const identity = await verifier.verify(tokens.access.token);
    if (identity.tenant !== deps.tenantId) throw invalid();
    const now = clock.now();
    if (
      !Number.isFinite(Date.parse(tokens.access.expires)) ||
      !Number.isFinite(Date.parse(tokens.refresh.expires)) ||
      Date.parse(tokens.access.expires) <= now ||
      Date.parse(tokens.refresh.expires) <= now
    )
      throw unavailable();
    return identity;
  }
  async function profile(identity: VerifiedAccess, accessToken: string): Promise<ProviderProfile> {
    const result = await provider.whoami(accessToken);
    if (result.id !== identity.subject || result.srv_t !== identity.tenant) throw invalid();
    return result;
  }
  async function encrypted(
    tokens: ProviderTokens,
    identity: VerifiedAccess,
    id: EntityId,
    version: number,
  ): Promise<EncryptedPair> {
    return {
      accessCiphertext: await deps.crypto.encrypt(tokens.access.token, id, 'access', version),
      refreshCiphertext: await deps.crypto.encrypt(tokens.refresh.token, id, 'refresh', version),
      accessExpiresAt: Math.min(identity.expiresAt, Date.parse(tokens.access.expires)),
      refreshExpiresAt: Date.parse(tokens.refresh.expires),
    };
  }
  async function projection(record: SessionRecord): Promise<Ict24hSessionDto> {
    const user = await resolveProfile(repository, record.userId);
    return Ict24hSessionSchema.parse({
      user,
      currentWorkspaceId: await defaultWorkspaceId(repository, user.id),
      capabilities: ict24hCapabilities,
      authSession: {
        id: record.id,
        accessExpiresAt: instant(record.accessExpiresAt),
        expiresAt: instant(record.expiresAt),
      },
    });
  }
  async function canonical(record: SessionRecord): Promise<Ict24hSessionDto> {
    const winner = requireSession(await findSession(repository, 'id', record.id), clock.now());
    await validateAccess(winner);
    return projection(winner);
  }
  async function validateAccess(record: SessionRecord) {
    const access = required(record.accessCiphertext, 'Missing access credential');
    const token = await deps.crypto.decrypt(access, record.id, 'access', record.tokenVersion);
    const identity = await verifier.verify(token);
    if (
      identity.subject !== record.subject ||
      identity.tenant !== record.tenant ||
      identity.tenant !== deps.tenantId
    )
      throw invalid();
  }
  return {
    async login(input, previousSid) {
      const previous = await lookup(previousSid);
      const result = await provider.login(input);
      const identity = await verified(result.tokens);
      if (result.user.id !== identity.subject || result.user.srv_t !== identity.tenant)
        throw invalid();
      const central = await profile(identity, result.tokens.access.token);
      const mapping = await ensureExternalProfile(
        repository,
        {
          providerKey: 'ict24h-identity',
          tenant: identity.tenant,
          subject: identity.subject,
          email: central.email,
          fullname: central.fullname,
          username: central.username,
        },
        { clock, generateId },
      );
      const id = generateId(),
        sid = deps.crypto.newSid(),
        now = clock.now();
      const pair = await encrypted(result.tokens, identity, id, 1);
      const record: SessionRecord = {
        id,
        sidHash: await deps.crypto.hashSid(sid),
        identityId: mapping.identityId,
        userId: mapping.user.id,
        ...pair,
        expiresAt: Math.min(pair.refreshExpiresAt, now + deps.maxAgeSeconds * 1000),
        tokenVersion: 1,
        authGeneration: 1,
        createdAt: now,
        revokedAt: null,
        subject: identity.subject,
        tenant: identity.tenant,
      };
      if (record.expiresAt <= now || record.accessExpiresAt <= now) throw invalid();
      if (!(await insertSession(repository, record, previous)))
        throw new ApiFailure('SESSION_CHANGED', 'The browser session has changed');
      return { session: await projection(record), sid };
    },
    async refresh(sid, expectedId) {
      const found = await lookup(sid);
      requireExpectedSession(found, expectedId);
      const record = requireSession(found, clock.now(), true);
      try {
        const token = await deps.crypto.decrypt(
          required(record.refreshCiphertext, 'Missing refresh credential'),
          record.id,
          'refresh',
          record.tokenVersion,
        );
        const tokens = await provider.refresh(token);
        const identity = await verified(tokens);
        if (identity.subject !== record.subject || identity.tenant !== record.tenant)
          throw invalid();
        await profile(identity, tokens.access.token);
        const pair = await encrypted(tokens, identity, record.id, record.tokenVersion + 1);
        if (!(await replacePair(repository, record, pair, clock.now()))) return canonical(record);
        return projection({ ...record, ...pair, tokenVersion: record.tokenVersion + 1 });
      } catch (error) {
        if (error instanceof ApiFailure && error.code === 'UNAUTHENTICATED') {
          if (!(await revokeSession(repository, record.id, clock.now(), record.tokenVersion)))
            return canonical(record);
        }
        throw error;
      }
    },
    async logout(sid, expectedId) {
      const record = await lookup(sid);
      if (!record) return { signedOut: true };
      requireExpectedSession(record, expectedId);
      if (record.revokedAt === null) await revokeSession(repository, record.id, clock.now());
      return { signedOut: true };
    },
    async authenticate(sid) {
      const record = requireSession(await lookup(sid), clock.now());
      await validateAccess(record);
      return { record, session: await projection(record) };
    },
  };
}
