import type { OidcBrowserProvider } from '../application/oidc-browser.ts';
import * as oidc from 'openid-client';
import { createRemoteJWKSet, jwtVerify, errors as jwtErrors } from 'jose';
import {
  oidcPolicy,
  OidcRefreshFailure,
  type OidcProvider,
  type RefreshRejection,
} from '../application/oidc-provider.ts';
import type { OidcSettings } from './oidc-settings.ts';
import { ApiFailure } from '../../../shared/errors.ts';
const invalid = () => new ApiFailure('UNAUTHENTICATED', 'Authentication required');
const unavailable = () =>
  new ApiFailure('AUTH_SERVICE_UNAVAILABLE', 'Authentication service is unavailable');
export async function oidcConfiguration(settings: OidcSettings): Promise<oidc.Configuration> {
  const config = await oidc.discovery(
    new URL(settings.issuer),
    settings.clientId,
    {
      client_secret: settings.clientSecret,
      token_endpoint_auth_method: 'client_secret_basic',
      id_token_signed_response_alg: 'EdDSA',
      [oidc.clockTolerance]: oidcPolicy.tolerance,
    },
    oidc.ClientSecretBasic(settings.clientSecret),
    { timeout: oidcPolicy.timeout },
  );
  const metadata = config.serverMetadata();
  if (metadata.issuer !== settings.issuer) throw unavailable();
  for (const field of [
    'authorization_endpoint',
    'token_endpoint',
    'jwks_uri',
    'userinfo_endpoint',
    'introspection_endpoint',
    'revocation_endpoint',
    'end_session_endpoint',
  ] as const) {
    const value = metadata[field];
    if (typeof value !== 'string') throw unavailable();
    const url = new URL(value),
      issuer = new URL(settings.issuer);
    if (
      url.origin !== issuer.origin ||
      !url.pathname.startsWith(issuer.pathname + '/') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw unavailable();
  }
  config.timeout = oidcPolicy.timeout;
  oidc.enableNonRepudiationChecks(config);
  return config;
}
export async function refreshRejection(
  error: unknown,
  config: oidc.Configuration,
): Promise<RefreshRejection> {
  const endpoint = config.serverMetadata().token_endpoint;
  if (
    error instanceof oidc.ResponseBodyError &&
    error.response.url === endpoint &&
    error.status >= 400 &&
    error.status < 500
  ) {
    if (error.error === 'invalid_grant') return 'terminal';
    if (error.error === 'invalid_client') return 'non-consuming';
  }
  if (
    error instanceof oidc.WWWAuthenticateChallengeError &&
    error.response.url === endpoint &&
    error.status >= 400 &&
    error.status < 500 &&
    error.cause.some((c) => c.scheme.toLowerCase() === 'basic') &&
    error.response.headers.get('content-type')?.split(';')[0]?.trim() === 'application/json'
  ) {
    try {
      const body: unknown = await error.response.clone().json();
      if (
        body &&
        typeof body === 'object' &&
        !Array.isArray(body) &&
        'error' in body &&
        body.error === 'invalid_client'
      )
        return 'non-consuming';
    } catch {
      /* Untrusted errors preserve the original uncertainty. */
    }
  }
  return 'unknown';
}
export function createOidcProvider(settings: OidcSettings): OidcProvider {
  async function active(config: oidc.Configuration, token: string, sid: string, subject: string) {
    const result = await oidc.tokenIntrospection(config, token);
    return (
      result.active === true &&
      typeof result.sid === 'string' &&
      result.sid === sid &&
      result.sub === subject
    );
  }
  return {
    async initial(tokens, nonce) {
      try {
        const config = await oidcConfiguration(settings),
          jwks = config.serverMetadata().jwks_uri;
        if (typeof jwks !== 'string') throw unavailable();
        const { payload } = await jwtVerify(
          tokens.id_token,
          createRemoteJWKSet(new URL(jwks), { timeoutDuration: oidcPolicy.timeout * 1000 }),
          {
            issuer: settings.issuer,
            audience: settings.clientId,
            algorithms: ['EdDSA'],
            clockTolerance: oidcPolicy.tolerance,
            maxTokenAge: oidcPolicy.access,
          },
        );
        if (
          !nonce ||
          typeof payload.exp !== 'number' ||
          typeof payload.iat !== 'number' ||
          payload.nonce !== nonce ||
          typeof payload.sub !== 'string' ||
          !payload.sub ||
          payload.sub.length > 255 ||
          typeof payload.sid !== 'string' ||
          !payload.sid ||
          (payload.azp !== undefined && payload.azp !== settings.clientId) ||
          (Array.isArray(payload.aud) &&
            payload.aud.length > 1 &&
            payload.azp !== settings.clientId) ||
          !tokens.refresh_token ||
          !tokens.access_token ||
          !Number.isFinite(tokens.expires_in) ||
          tokens.expires_in <= 0 ||
          tokens.expires_in > oidcPolicy.access
        )
          throw invalid();
        if (!(await active(config, tokens.access_token, payload.sid, payload.sub))) throw invalid();
        return { subject: payload.sub, sid: payload.sid };
      } catch (error) {
        if (error instanceof ApiFailure) throw error;
        if (
          error instanceof jwtErrors.JWTClaimValidationFailed ||
          error instanceof jwtErrors.JWTExpired ||
          error instanceof jwtErrors.JWSInvalid ||
          error instanceof jwtErrors.JWTInvalid ||
          error instanceof jwtErrors.JOSEAlgNotAllowed ||
          error instanceof jwtErrors.JWSSignatureVerificationFailed ||
          error instanceof jwtErrors.JWKSNoMatchingKey
        )
          throw invalid();
        throw unavailable();
      }
    },
    async refresh(tokens) {
      const config = await oidcConfiguration(settings);
      let next: Awaited<ReturnType<typeof oidc.refreshTokenGrant>>;
      try {
        next = await oidc.refreshTokenGrant(config, tokens.refresh_token);
      } catch (error) {
        throw new OidcRefreshFailure(await refreshRejection(error, config));
      }
      if (
        !next.refresh_token ||
        !next.expires_in ||
        next.expires_in <= 0 ||
        next.expires_in > oidcPolicy.access
      )
        throw unavailable();
      return {
        access_token: next.access_token,
        refresh_token: next.refresh_token,
        expires_in: next.expires_in,
        ...(next.id_token
          ? { id_token: next.id_token }
          : tokens.id_token
            ? { id_token: tokens.id_token }
            : {}),
      };
    },
    async active(tokens, identity) {
      try {
        return await active(
          await oidcConfiguration(settings),
          tokens.access_token,
          identity.sid,
          identity.subject,
        );
      } catch {
        throw unavailable();
      }
    },
  };
}

export function createOidcBrowserProvider(settings: OidcSettings): OidcBrowserProvider {
  return {
    async authorization(secret, state) {
      return oidc.buildAuthorizationUrl(await oidcConfiguration(settings), {
        redirect_uri: settings.origin + '/auth/callback',
        scope: 'openid profile email offline_access',
        state,
        nonce: secret.nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(secret.verifier),
        code_challenge_method: 'S256',
      }).href;
    },
    async exchange(search, secret, state, ensureClaimed) {
      try {
        const config = await oidcConfiguration(settings);
        await ensureClaimed();
        const tokens = await oidc.authorizationCodeGrant(
          config,
          new URL(settings.origin + '/auth/callback' + search),
          {
            pkceCodeVerifier: secret.verifier,
            expectedState: state,
            expectedNonce: secret.nonce,
            idTokenExpected: true,
          },
          { redirect_uri: settings.origin + '/auth/callback' },
        );
        if (!tokens.id_token || !tokens.refresh_token || !tokens.expires_in) throw invalid();
        return {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          id_token: tokens.id_token,
          expires_in: tokens.expires_in,
        };
      } catch (error) {
        if (error instanceof ApiFailure) throw error;
        if (
          error instanceof oidc.AuthorizationResponseError ||
          (error instanceof oidc.ResponseBodyError &&
            error.status >= 400 &&
            error.status < 500 &&
            error.error !== 'invalid_client') ||
          (error instanceof oidc.ClientError &&
            [
              'OAUTH_INVALID_RESPONSE',
              'OAUTH_JWT_CLAIM_COMPARISON_FAILED',
              'OAUTH_JWT_TIMESTAMP_CHECK_FAILED',
              'OAUTH_INVALID_REQUEST',
            ].includes(error.code ?? ''))
        )
          throw invalid();
        throw unavailable();
      }
    },
    async logout(state) {
      return oidc.buildEndSessionUrl(await oidcConfiguration(settings), {
        client_id: settings.clientId,
        post_logout_redirect_uri: settings.origin + '/auth/logged-out',
        state,
      }).href;
    },
    async revoke(refreshToken) {
      await oidc.tokenRevocation(await oidcConfiguration(settings), refreshToken, {
        token_type_hint: 'refresh_token',
      });
    },
  };
}
