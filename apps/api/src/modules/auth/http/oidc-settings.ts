import { z } from 'zod';
import type { OidcBindings } from '../../../runtime.ts';
import { ApiFailure } from '../../../shared/errors.ts';
export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  origin: string;
  environment: string;
  cookieName: string;
  secureCookie: true;
  keyset: { active: string; keys: Record<string, string> };
}
const Keyset = z.strictObject({
  active: z.string().min(1).max(80),
  keys: z.record(z.string().min(1).max(80), z.string().regex(/^[A-Za-z0-9_-]{43}$/u)),
});
// A trusted server binding selects one complete local origin set, never a request value.
export function oidcOrigins(profile?: string) {
  if (profile === undefined)
    return {
      issuer: 'https://identity-service.demo/api/auth',
      origin: 'https://datamaker-task.demo',
    };
  if (profile === 'dev1355')
    return {
      issuer: 'https://identity-service.demo:1355/api/auth',
      origin: 'https://datamaker-task.demo:1355',
    };
  throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Authentication configuration is unavailable');
}
export function oidcSettings(env: OidcBindings & { AUTH_MODE?: string }): OidcSettings {
  try {
    const expected = oidcOrigins(env.OIDC_LOCAL_PROFILE);
    if (
      env.AUTH_MODE !== 'oidc' ||
      env.OIDC_ISSUER !== expected.issuer ||
      env.AUTH_APP_ORIGIN !== expected.origin
    )
      throw new Error();
    const keyset = Keyset.parse(JSON.parse(z.string().parse(env.RP_TOKEN_ENCRYPTION_KEYSET)));
    if (
      !Object.hasOwn(keyset.keys, keyset.active) ||
      Object.values(keyset.keys).some((value) => {
        const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
          c.charCodeAt(0),
        );
        return (
          bytes.length !== 32 ||
          btoa(String.fromCharCode(...bytes))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '') !== value
        );
      })
    )
      throw new Error();
    return {
      issuer: env.OIDC_ISSUER,
      origin: env.AUTH_APP_ORIGIN,
      clientId: z.string().min(1).max(512).parse(env.OIDC_CLIENT_ID),
      clientSecret: z.string().min(1).max(4096).parse(env.OIDC_CLIENT_SECRET),
      environment: z
        .string()
        .regex(/^[a-zA-Z0-9_-]{1,80}$/u)
        .parse(env.RP_ENVIRONMENT),
      keyset,
      cookieName: '__Host-task8_oidc_session',
      secureCookie: true,
    };
  } catch {
    throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Authentication configuration is unavailable');
  }
}
export function oidcCookie(sid: string, expiresAt: number, now: number): string {
  return `__Host-task8_oidc_session=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((expiresAt - now) / 1000))}`;
}
