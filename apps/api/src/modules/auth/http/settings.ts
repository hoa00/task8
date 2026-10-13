import { z } from 'zod';
import { ApiFailure } from '../../../shared/errors.ts';
import { providerConfig } from './config.ts';
import type { AuthBindings } from '../../../runtime.ts';
export type { AuthBindings } from '../../../runtime.ts';
export interface AuthSettings {
  baseUrl: string;
  tenantId: string;
  publicKey: string;
  encryptionKey: string;
  maxAgeSeconds: number;
  appOrigin: string;
  secureCookie: boolean;
  cookieName: string;
}
export function authSettings(env: AuthBindings & { STUDIO_ENV?: string }): AuthSettings {
  try {
    if (env.AUTH_MODE !== 'ict24h' || env.AUTH_PROVIDER_KEY !== 'ict24h-identity')
      throw new Error();
    const config = providerConfig({
      baseUrl: env.AUTH_PROVIDER_BASE_URL,
      tenantId: env.AUTH_TENANT_ID,
    });
    const url = new URL(z.url().parse(env.AUTH_APP_ORIGIN));
    if (url.origin !== env.AUTH_APP_ORIGIN || url.username || url.password) throw new Error();
    const secureCookie = url.protocol === 'https:';
    if (
      !secureCookie &&
      (env.STUDIO_ENV !== 'local' ||
        url.protocol !== 'http:' ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
      throw new Error();
    return {
      ...config,
      publicKey: z.string().min(1).parse(env.AUTH_PUBLIC_KEY),
      encryptionKey: z.string().min(1).parse(env.AUTH_SESSION_ENCRYPTION_KEY),
      maxAgeSeconds: z.coerce
        .number()
        .int()
        .min(1)
        .max(1209600)
        .parse(env.AUTH_SESSION_MAX_AGE_SECONDS ?? '1209600'),
      appOrigin: url.origin,
      secureCookie,
      cookieName: secureCookie ? '__Host-task8_session' : 'task8_local_session',
    };
  } catch {
    throw new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Authentication configuration is unavailable');
  }
}
export function requireOrigin(request: Request, settings: AuthSettings): void {
  if (request.headers.get('origin') !== settings.appOrigin)
    throw new ApiFailure('FORBIDDEN', 'Request origin is not allowed');
}
export function requestSid(request: Request, settings: AuthSettings): string | undefined {
  const values = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(settings.cookieName + '='));
  if (values.length !== 1) return undefined;
  const value = values[0]?.slice(settings.cookieName.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : undefined;
}
export function sessionCookie(
  sid: string,
  settings: AuthSettings,
  remember: boolean,
  expiresAt: number,
  now: number,
): string {
  return `${settings.cookieName}=${sid}; Path=/; HttpOnly; SameSite=Lax${settings.secureCookie ? '; Secure' : ''}${remember ? `; Max-Age=${Math.max(0, Math.floor((expiresAt - now) / 1000))}; Expires=${new Date(expiresAt).toUTCString()}` : ''}`;
}
