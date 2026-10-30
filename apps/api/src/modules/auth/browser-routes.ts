import { AuthMetadataSchema, OidcLogoutResultSchema } from '@studio/contracts/api';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ApiEnvironment } from '../../runtime.ts';
import { ApiFailure } from '../../shared/errors.ts';
import {
  transactionInvalid,
  UnlinkedIdentityFailure,
  oidcPolicy,
} from './application/oidc-browser.ts';
import {
  oidcSettings,
  oidcCookie,
  authSettings,
  requireOrigin,
  checkedCookie,
  csrfProof,
  requireCookieCsrf,
  preauthCookieName,
} from './http/index.ts';
import type { createOidcBrowserService } from './index.ts';
type BrowserService = ReturnType<typeof createOidcBrowserService>;
export type BrowserServiceFactory = (env: ApiEnvironment['Bindings']) => BrowserService;
const loginCookie = '__Host-task8_oidc_login',
  logoutCookie = '__Host-task8_oidc_logout';
const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const mode = (env: ApiEnvironment['Bindings']) =>
  env.AUTH_MODE === 'oidc'
    ? 'oidc'
    : env.AUTH_MODE === 'ict24h'
      ? 'ict24h'
      : env.AUTH_MODE === 'local' && env.STUDIO_ENV === 'local'
        ? 'local'
        : 'disabled';
function scalarQuery(url: URL, allowed: string[]) {
  for (const key of url.searchParams.keys())
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
      throw transactionInvalid();
}
export function createAuthMetadataRoutes() {
  const routes = new Hono<ApiEnvironment>();
  routes.get('/auth-metadata', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(AuthMetadataSchema.parse({ mode: mode(c.env), csrf: null }));
  });
  return routes;
}
export function createBrowserAuthRoutes(factory: BrowserServiceFactory) {
  const routes = new Hono<ApiEnvironment>();
  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    await next();
  });
  routes.get('/context', async (c) => {
    const selected = mode(c.env);
    if (selected === 'local' || selected === 'disabled')
      return c.json(AuthMetadataSchema.parse({ mode: selected, csrf: null }));
    const settings = selected === 'oidc' ? oidcSettings(c.env) : authSettings(c.env);
    let token = checkedCookie(c.req.raw, settings.cookieName);
    if (!token && selected === 'ict24h') {
      token = checkedCookie(c.req.raw, preauthCookieName(settings.secureCookie));
      if (!token) {
        token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
          .replaceAll('+', '-')
          .replaceAll('/', '_')
          .replaceAll('=', '');
        c.header(
          'Set-Cookie',
          `${preauthCookieName(settings.secureCookie)}=${token}; Path=/; HttpOnly; SameSite=Lax${settings.secureCookie ? '; Secure' : ''}; Max-Age=600`,
          { append: true },
        );
      }
    }
    return c.json(
      AuthMetadataSchema.parse({ mode: selected, csrf: token ? await csrfProof(token) : null }),
    );
  });
  routes.use('*', async (c, next) => {
    if (mode(c.env) !== 'oidc') throw new ApiFailure('NOT_FOUND', 'Not found');
    await next();
  });
  routes.get('/login', async (c) => {
    try {
      const settings = oidcSettings(c.env),
        url = new URL(c.req.url);
      scalarQuery(url, ['returnTo']);
      const result = await factory(c.env).begin(
        url.searchParams.get('returnTo'),
        checkedCookie(c.req.raw, settings.cookieName),
      );
      c.header('Set-Cookie', cookie(loginCookie, result.binding, oidcPolicy.transaction), {
        append: true,
      });
      return c.redirect(result.redirect, 303);
    } catch (error) {
      if (error instanceof ApiFailure && error.code !== 'AUTH_SERVICE_UNAVAILABLE') throw error;
      return c.redirect('/login?authError=unavailable', 303);
    }
  });
  routes.get('/callback', async (c) => {
    try {
      const settings = oidcSettings(c.env),
        url = new URL(c.req.url);
      scalarQuery(url, ['code', 'state', 'error', 'error_description', 'error_uri', 'iss']);
      const state = url.searchParams.get('state'),
        code = url.searchParams.get('code'),
        error = url.searchParams.get('error');
      if (
        !state ||
        !!code === !!error ||
        (code &&
          (code.length > 2048 ||
            [...code].some((x) => x.charCodeAt(0) <= 32 || x.charCodeAt(0) === 127)))
      )
        throw transactionInvalid();
      const result = await factory(c.env).callback(
        url.search,
        state,
        checkedCookie(c.req.raw, loginCookie),
        checkedCookie(c.req.raw, settings.cookieName),
        !!error,
      );
      c.header('Set-Cookie', oidcCookie(result.sid, result.expiresAt, Date.now()), {
        append: true,
      });
      c.header('Set-Cookie', cookie(loginCookie, '', 0), { append: true });
      return c.redirect(result.returnTo, 303);
    } catch (error) {
      const kind =
        error instanceof ApiFailure
          ? error instanceof UnlinkedIdentityFailure
            ? 'unlinked'
            : error.code === 'AUTH_SERVICE_UNAVAILABLE'
              ? 'unavailable'
              : 'transaction'
          : 'unavailable';
      return c.redirect('/login?authError=' + kind, 303);
    }
  });
  routes.use(
    '/logout',
    bodyLimit({
      maxSize: 1024,
      onError: () => {
        throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Request is too large');
      },
    }),
  );
  routes.post('/logout', async (c) => {
    const settings = oidcSettings(c.env);
    requireOrigin(c.req.raw, { appOrigin: settings.origin });
    let body: unknown,
      proof = c.req.header('X-CSRF-Token');
    if (c.req.header('Content-Type')?.split(';')[0] === 'application/x-www-form-urlencoded') {
      const form = new URLSearchParams(await c.req.text());
      if (
        [...form.keys()].some(
          (key) => !['provider', 'csrf'].includes(key) || form.getAll(key).length !== 1,
        ) ||
        form.get('provider') !== 'true'
      )
        throw transactionInvalid();
      body = { provider: true };
      proof = form.get('csrf') ?? undefined;
    } else body = await c.req.json().catch(() => null);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'provider') ||
      !('provider' in body) ||
      typeof body.provider !== 'boolean'
    )
      throw transactionInvalid();
    const sid = checkedCookie(c.req.raw, settings.cookieName);
    if (sid) await requireCookieCsrf(c.req.raw, settings.cookieName, proof);
    // Clear the RP cookies independently of upstream availability. The use-case revokes locally before network.
    c.header('Set-Cookie', cookie(settings.cookieName, '', 0), { append: true });
    c.header('Set-Cookie', cookie(loginCookie, '', 0), { append: true });
    const result = await factory(c.env).logout(sid, body.provider);
    if (result.binding)
      c.header('Set-Cookie', cookie(logoutCookie, result.binding, oidcPolicy.transaction), {
        append: true,
      });
    return body.provider
      ? c.redirect(result.redirect ?? '/login', 303)
      : c.json(OidcLogoutResultSchema.parse({ redirect: null }));
  });
  routes.get('/logged-out', async (c) => {
    const url = new URL(c.req.url);
    scalarQuery(url, ['state']);
    const state = url.searchParams.get('state');
    if (!state) throw transactionInvalid();
    await factory(c.env).complete(state, checkedCookie(c.req.raw, logoutCookie));
    c.header('Set-Cookie', cookie(logoutCookie, '', 0), { append: true });
    return c.redirect('/login', 303);
  });
  return routes;
}
