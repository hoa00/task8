import type { z } from 'zod';
import { z as schema } from 'zod';
import type { Clock } from '../../../shared/clock.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import {
  ProviderLoginSchema,
  ProviderProfileSchema,
  ProviderTokensSchema,
  type IdentityProvider,
  type ProviderTokens,
} from '../application/provider.ts';
import { authProviderLimits, providerConfig, type ProviderConfig } from './config.ts';

export interface ProviderDependencies {
  fetch: typeof fetch;
  clock: Clock;
}
type ProviderOperation = 'login' | 'refresh' | 'whoami';
const EnvelopeSchema = schema.object({
  statusCode: schema.number().int(),
  message: schema.string(),
  data: schema.unknown().optional(),
  error: schema.unknown().optional(),
});
const unavailable = () =>
  new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable');
const invalidCredentials = () => new ApiFailure('UNAUTHENTICATED', 'Authentication required');

async function responseJson(response: Response): Promise<unknown> {
  if (
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    throw unavailable();
  const advertisedLength = response.headers.get('content-length');
  if (
    advertisedLength !== null &&
    (!/^\d+$/u.test(advertisedLength) ||
      Number(advertisedLength) > authProviderLimits.responseBytes)
  ) {
    await response.body?.cancel();
    throw unavailable();
  }
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > authProviderLimits.responseBytes) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw unavailable();
  }
}

function decode<T extends z.ZodType>(
  response: Response,
  input: unknown,
  operation: ProviderOperation,
  dataSchema: T,
): z.output<T> {
  if (response.status >= 500 || response.status === 429) throw unavailable();
  if (input === null || typeof input !== 'object') throw unavailable();
  const result = EnvelopeSchema.safeParse(input);
  if (!result.success) throw unavailable();
  const envelope = result.data;
  if (
    !response.ok ||
    envelope.statusCode !== 200 ||
    envelope.message !== 'success' ||
    Object.hasOwn(input, 'error')
  ) {
    const status = response.ok ? envelope.statusCode : response.status;
    const rejection = operation === 'whoami' ? [401, 403, 404] : [400, 401, 403];
    if (rejection.includes(status) && Object.hasOwn(input, 'error')) throw invalidCredentials();
    throw unavailable();
  }
  const data = dataSchema.safeParse(envelope.data);
  if (!data.success) throw unavailable();
  return data.data;
}

export function createIdentityProvider(
  input: ProviderConfig,
  dependencies: ProviderDependencies,
): IdentityProvider {
  const config = providerConfig(input);
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
    'i24h-tenant': config.tenantId,
  };
  async function request<T extends z.ZodType>(
    operation: ProviderOperation,
    path: string,
    init: RequestInit,
    dataSchema: T,
  ): Promise<z.output<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), authProviderLimits.timeoutMs);
    try {
      const response = await dependencies.fetch(config.baseUrl.replace(/\/+$/u, '') + path, {
        ...init,
        redirect: 'error',
        signal: controller.signal,
      });
      const body = await responseJson(response);
      return decode(response, body, operation, dataSchema);
    } catch (error) {
      // No upstream body, credential, stack or network cause crosses this boundary.
      if (error instanceof ApiFailure) throw error;
      throw unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }
  function validateTokens(tokens: ProviderTokens): ProviderTokens {
    const now = dependencies.clock.now();
    if (
      ![tokens.access, tokens.refresh].every(
        (token) =>
          Date.parse(token.expires) > now &&
          new TextEncoder().encode(token.token).byteLength <= authProviderLimits.tokenBytes,
      )
    )
      throw unavailable();
    return tokens;
  }
  return {
    async login(input) {
      const result = await request(
        'login',
        '/v1/auth/login',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: input.email, password: input.password }),
        },
        ProviderLoginSchema,
      );
      validateTokens(result.tokens);
      if (result.user.srv_t !== config.tenantId) throw invalidCredentials();
      return result;
    },
    async refresh(refreshToken) {
      return validateTokens(
        await request(
          'refresh',
          '/v1/auth/refresh-token',
          { method: 'POST', headers, body: JSON.stringify({ refreshToken }) },
          ProviderTokensSchema,
        ),
      );
    },
    async whoami(accessToken) {
      const profile = await request(
        'whoami',
        '/v1/user/whoami',
        { method: 'GET', headers: { ...headers, authorization: `Bearer ${accessToken}` } },
        ProviderProfileSchema,
      );
      if (profile.srv_t !== config.tenantId) throw invalidCredentials();
      return profile;
    },
  };
}
