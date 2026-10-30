import * as oidc from 'openid-client';
import { z } from 'zod';
import { EntityIdSchema } from '@studio/contracts/api';
import { createApp, createOidcService, authRepository } from '../../src/app.ts';
import { RequestRepository, type SqlValue } from '../../src/db/client.ts';
import {
  oidcConfiguration,
  oidcSettings,
  createOidcProvider,
} from '../../src/modules/auth/http/index.ts';
import { createOidcSessionService } from '../../src/modules/auth/index.ts';
import { createOidcCrypto } from '../../src/modules/auth/storage/index.ts';
import { ApiFailure } from '../../src/shared/errors.ts';
import { serverClock } from '../../src/shared/clock.ts';
import { newId } from '../../src/shared/ids.ts';
import { dispatch, type ProbeEnvironment } from './oidc-driver.ts';
const SqlValueSchema = z.union([z.string(), z.number(), z.null()]);
const Initial = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  id_token: z.string(),
  expires_in: z.number(),
});
const status = (error: unknown) =>
  error instanceof ApiFailure
    ? error.code === 'UNAUTHENTICATED'
      ? 401
      : error.code === 'FORBIDDEN'
        ? 403
        : 503
    : 500;
// Native SDK, crypto, repositories and app boundaries; no production entry imports this file.
export default {
  async fetch(
    request: Request,
    env: ProbeEnvironment,
    context: ExecutionContext,
  ): Promise<Response> {
    if (new URL(request.url).pathname !== '/__private_probe') {
      let paused = false;
      const database = new Proxy(env.DB, {
        get(target, key) {
          if (key === 'withSession')
            return (constraint: D1SessionBookmark | string) => {
              const session = target.withSession(constraint);
              return new Proxy(session, {
                get(owner, property) {
                  if (property === 'batch')
                    return async <T>(statements: D1PreparedStatement[]) => {
                      if (!paused && request.headers.get('x-fixture-commit') === env.DRIVER_KEY) {
                        paused = true;
                        await env.BARRIER.fetch('http://barrier/business-commit');
                      }
                      return owner.batch<T>(statements);
                    };
                  const value = Reflect.get(owner, property, owner);
                  return typeof value === 'function' ? value.bind(owner) : value;
                },
              });
            };
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      return createApp().fetch(request, { ...env, DB: database }, context);
    }
    return dispatch(request, env.DRIVER_KEY, async (method, args) => {
      if (method === 'begin') {
        const config = await oidcConfiguration(oidcSettings(env)),
          nonce = oidc.randomNonce(),
          verifier = oidc.randomPKCECodeVerifier(),
          state = oidc.randomState();
        return {
          nonce,
          verifier,
          state,
          url: oidc.buildAuthorizationUrl(config, {
            redirect_uri: env.AUTH_APP_ORIGIN + '/auth/callback',
            scope: 'openid profile email offline_access',
            nonce,
            state,
            code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
            code_challenge_method: 'S256',
          }).href,
        };
      }
      if (method === 'grant') {
        const [callback, verifier, state, nonce] = z
          .tuple([z.string(), z.string(), z.string(), z.string()])
          .parse(args);
        const tokens = await oidc.authorizationCodeGrant(
          await oidcConfiguration(oidcSettings(env)),
          new URL(callback),
          {
            pkceCodeVerifier: verifier,
            expectedState: state,
            expectedNonce: nonce,
            idTokenExpected: true,
          },
          { redirect_uri: env.AUTH_APP_ORIGIN + '/auth/callback' },
        );
        if (!tokens.refresh_token || !tokens.id_token || !tokens.expires_in)
          throw new Error('FIXTURE_TOKEN_SHAPE');
        return {
          tokens: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            id_token: tokens.id_token,
            expires_in: tokens.expires_in,
          },
          subject: tokens.claims()?.sub,
        };
      }
      if (method === 'create') {
        const [tokens, nonce] = z.tuple([Initial, z.string()]).parse(args);
        try {
          return {
            status: 200,
            result: await createOidcService(env, authRepository(env)).create(tokens, nonce),
          };
        } catch (error) {
          return { status: status(error) };
        }
      }
      if (method === 'authenticate') {
        const [sid, options] = z
          .tuple([
            z.string(),
            z
              .object({
                secret: z.string().optional(),
                phase: z.enum(['read', 'claim', 'mark']).optional(),
              })
              .default({}),
          ])
          .parse(args);
        const bindings = {
            ...env,
            ...(options.secret ? { OIDC_CLIENT_SECRET: options.secret } : {}),
          },
          settings = oidcSettings(bindings);
        let paused = false;
        class ControlledRepository extends RequestRepository {
          override async all<T>(sql: string, parameters: readonly SqlValue[] = []): Promise<T[]> {
            const rows = await super.all<T>(sql, parameters),
              phase = options.phase;
            if (
              !paused &&
              phase &&
              (phase === 'read'
                ? sql.startsWith('SELECT * FROM oidcAppSessions')
                : phase === 'claim'
                  ? sql.startsWith('UPDATE oidcAppSessions SET leaseOwner=')
                  : sql.startsWith('UPDATE oidcAppSessions SET refreshInput='))
            ) {
              paused = true;
              await env.BARRIER.fetch('http://barrier/' + phase);
            }
            return rows;
          }
        }
        const repository = new ControlledRepository(env.DB, { primary: true }),
          service = createOidcSessionService({
            repository,
            clock: serverClock,
            generateId: newId,
            provider: createOidcProvider(settings),
            crypto: createOidcCrypto(settings),
            issuer: settings.issuer,
            clientId: settings.clientId,
          });
        try {
          const result = await service.authenticate(sid);
          return {
            status: 200,
            userId: result.principal.user.id,
            sessionId: result.principal.authSession.id,
            currentWorkspaceId: result.principal.currentWorkspaceId,
            mechanism: result.principal.authentication.mechanism,
            validatedAt: result.principal.authentication.authorityValidatedAt,
            statements: repository.statements,
          };
        } catch (error) {
          return { status: status(error) };
        }
      }
      if (method === 'offline' || method === 'revokeGrant') {
        const sid = z.tuple([z.string()]).parse(args)[0],
          settings = oidcSettings(env),
          cryptography = createOidcCrypto(settings);
        const saved = z
          .object({
            id: EntityIdSchema,
            linkId: EntityIdSchema,
            issuer: z.string(),
            subject: z.string(),
            clientId: z.string(),
            providerSid: z.string(),
            bundle: z.string(),
          })
          .parse(
            await env.DB.prepare('SELECT * FROM oidcAppSessions WHERE sidHash=?')
              .bind(await cryptography.hashSid(sid))
              .first(),
          );
        const tokens = await cryptography.open(saved, saved.bundle),
          config = await oidcConfiguration(settings);
        if (method === 'revokeGrant') {
          await oidc.tokenRevocation(config, tokens.refresh_token, {
            token_type_hint: 'refresh_token',
          });
          return { status: 200 };
        }
        const next = await oidc.refreshTokenGrant(config, tokens.refresh_token),
          active = await oidc.tokenIntrospection(config, next.access_token);
        return {
          refreshStatus: 200,
          active: active.active,
          sidPresent: typeof active.sid === 'string',
          originalSidMatches: active.sid === saved.providerSid,
          subjectMatches: active.sub === saved.subject,
        };
      }
      if (method === 'revoke')
        return createOidcService(env, authRepository(env)).revoke(
          z.tuple([z.string()]).parse(args)[0],
        );
      if (method === 'sql') {
        const [sql, parameters] = z
          .tuple([z.string(), z.array(SqlValueSchema).default([])])
          .parse(args);
        return (
          await env.DB.prepare(sql)
            .bind(...parameters)
            .all()
        ).results;
      }
      if (method === 'batch') {
        const [rows] = z
          .tuple([
            z.array(z.object({ sql: z.string(), parameters: z.array(SqlValueSchema) })).max(50),
          ])
          .parse(args);
        return env.DB.batch(rows.map((row) => env.DB.prepare(row.sql).bind(...row.parameters)));
      }
      if (method === 'inspect')
        return env.DB.prepare('SELECT * FROM oidcAppSessions WHERE sidHash=?')
          .bind(
            await createOidcCrypto(oidcSettings(env)).hashSid(z.tuple([z.string()]).parse(args)[0]),
          )
          .first();
      throw new Error('UNKNOWN_FIXTURE_COMMAND');
    });
  },
};
