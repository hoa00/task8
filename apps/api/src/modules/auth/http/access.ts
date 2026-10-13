import { I24HTokenAuthGuard, UserAuthInfo, type I24HEnv } from '@hoa00/i24h-auth-honojs';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Clock } from '../../../shared/clock.ts';
import { ApiFailure } from '../../../shared/errors.ts';
import type { AccessVerifier } from '../application/access.ts';
import { authProviderLimits } from './config.ts';

export interface AccessConfig {
  publicKey: string;
  tenantId: string;
}

const AuthInfoSchema = z.object({ userId: z.uuid(), tenantId: z.string().min(1) });
const ClaimsSchema = z.object({
  sub: z.uuid(),
  tenant: z.string().min(1),
  type: z.literal('ACCESS_TOKEN'),
  exp: z
    .number()
    .int()
    .positive()
    .max(Math.floor(Number.MAX_SAFE_INTEGER / 1000)),
});
const unauthenticated = () => new ApiFailure('UNAUTHENTICATED', 'Authentication required');

export function createAccessVerifier(input: AccessConfig, clock: Clock): AccessVerifier {
  const tenantId = input.tenantId;
  // The package validates and captures the actual RSA key. No Basic credentials are enabled.
  const guard = I24HTokenAuthGuard({
    publicKey: input.publicKey.replaceAll('\\n', '\n'),
    tenantId,
    serviceCredentials: {},
  });
  const verifier = new Hono<I24HEnv>();
  verifier.onError((error, context) => {
    if (error instanceof HTTPException && error.status === 401)
      return context.json({ error: 'UNAUTHENTICATED' }, 401);
    return context.json({ error: 'AUTH_SERVICE_UNAVAILABLE' }, 503);
  });
  verifier.get('/verify', guard, (context) => context.json(UserAuthInfo(context)));

  return {
    async verify(token) {
      if (new TextEncoder().encode(token).byteLength > authProviderLimits.tokenBytes)
        throw unauthenticated();
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) throw unauthenticated();
      // A dedicated request/context feeds the public Bearer guard. The caller's body and
      // browser Authorization header are never changed or used as an identity source.
      const response = await verifier.request('https://auth.internal/verify', {
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.status === 401) throw unauthenticated();
      if (!response.ok)
        throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable');
      const identity = AuthInfoSchema.safeParse(await response.json());
      if (!identity.success) throw unauthenticated();

      // Decode supplementary claims only AFTER the package has verified the same token.
      // This is not a signature verifier. The library permits missing exp; task8 does not.
      const payload = token.split('.')[1];
      if (!payload) throw unauthenticated();
      let claims;
      try {
        const bytes = Uint8Array.from(
          atob(payload.replaceAll('-', '+').replaceAll('_', '/')),
          (c) => c.charCodeAt(0),
        );
        claims = ClaimsSchema.safeParse(
          JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)),
        );
      } catch {
        throw unauthenticated();
      }
      if (
        !claims.success ||
        claims.data.sub !== identity.data.userId ||
        claims.data.tenant !== identity.data.tenantId ||
        claims.data.tenant !== tenantId ||
        claims.data.exp * 1000 <= clock.now()
      )
        throw unauthenticated();
      return {
        subject: identity.data.userId,
        tenant: identity.data.tenantId,
        expiresAt: claims.data.exp * 1000,
      };
    },
  };
}
