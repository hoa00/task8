import { oidcOrigins } from '../src/modules/auth/http/oidc-settings.ts';
import {
  AccountLinkError,
  applyLink,
  inspectLink,
  revokeLink,
  lookupLinkReceipt,
} from '../src/modules/auth/persistence/account-links.ts';
import type {
  LinkCommand,
  LinkReceipt,
  LinkTarget,
} from '../src/modules/auth/domain/account-links.ts';
import { RequestRepository } from '../src/db/client.ts';
import { z } from 'zod';
const text = z
  .string()
  .min(1)
  .max(255)
  .refine((value) =>
    [...value].every((char) => {
      const point = char.codePointAt(0);
      return point !== undefined && point >= 32 && point !== 127 && char !== '<' && char !== '>';
    }),
  );
const entityId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
const targetSchema = z
  .object({
    localUserId: entityId,
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('existing-local-user'), localUserId: entityId }).strict(),
      z
        .object({
          kind: z.literal('legacy-ict24h'),
          providerKey: z.literal('ict24h-identity'),
          tenant: text,
          subject: z.uuid(),
        })
        .strict(),
    ]),
    expectedLink: z.literal('absent-or-identical'),
    verifyOnlyMemberships: z
      .array(z.object({ workspaceId: entityId, memberId: entityId }).strict())
      .max(100),
  })
  .strict();
const linkSchema = z
  .object({
    id: entityId,
    issuer: text,
    subject: text,
    userId: entityId,
    status: z.enum(['active', 'revoked']),
    revision: z.number().int().positive(),
    createdAt: z.number().int().positive(),
    createdBy: text,
    migrationBatchId: z.string().min(1).max(1000),
  })
  .strict();
const snapshotSchema = z
  .object({
    user: z.string().max(4096).nullable(),
    source: z.string().max(4096).nullable(),
    memberships: z.array(z.string().max(4096)).max(100),
    link: linkSchema.nullable(),
    outcome: z.enum([
      'create-link',
      'already-linked',
      'conflict',
      'missing-user',
      'missing-membership',
      'source-mismatch',
    ]),
  })
  .strict();
const commandSchema = z
  .object({
    manifestId: text,
    manifestDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    entryId: text,
    issuer: z.enum([
      'https://identity-service.demo/api/auth',
      'https://identity-service.demo:1355/api/auth',
    ]),
    subject: text,
    target: targetSchema,
    snapshot: snapshotSchema,
    actor: text,
    correlation: text,
    candidateId: entityId,
    marker: text,
    now: z.number().int().positive(),
  })
  .strict();
const receiptSchema = z
  .object({
    manifestId: text,
    manifestDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    entryId: text,
    linkId: entityId,
    issuer: text,
    subject: text,
    localUserId: entityId,
    outcome: z.enum(['created-by-this-operation', 'already-linked']),
    revision: z.number().int().positive(),
    actor: text,
    correlation: text,
    createdAt: z.number().int().positive(),
    revokedAt: z.number().int().positive().nullable(),
    revokedRevision: z.number().int().positive().nullable(),
    revokeKind: z.string().nullable(),
  })
  .strict();
const contextSchema = z
  .object({
    actor: text,
    correlation: text,
    marker: text,
    now: z.number().int().positive(),
    kind: z.enum(['rollback', 'revoke']),
  })
  .strict();
const operatorInput = z.discriminatedUnion('method', [
  z
    .object({
      method: z.literal('inspect'),
      args: z.tuple([
        z.enum([
          'https://identity-service.demo/api/auth',
          'https://identity-service.demo:1355/api/auth',
        ]),
        text,
        targetSchema,
      ]),
    })
    .strict(),
  z.object({ method: z.literal('apply'), args: z.tuple([commandSchema]) }).strict(),
  z.object({ method: z.literal('revoke'), args: z.tuple([receiptSchema, contextSchema]) }).strict(),
  z.object({ method: z.literal('lookup'), args: z.tuple([commandSchema]) }).strict(),
  z.object({ method: z.literal('profile'), args: z.tuple([]) }).strict(),
]);
// Validate the complete local issuer profile before any database access.
export function parseAccountLinkInput(payload: unknown, profile?: string) {
  const parsed = operatorInput.safeParse(payload);
  if (!parsed.success) return null;
  let expectedIssuer: string;
  try {
    expectedIssuer = oidcOrigins(profile).issuer;
  } catch {
    return null;
  }
  const input = parsed.data;
  const issuer =
    input.method === 'inspect'
      ? input.args[0]
      : input.method === 'apply' || input.method === 'lookup'
        ? input.args[0].issuer
        : undefined;
  if (issuer !== undefined && issuer !== expectedIssuer) return null;
  return input;
}
interface OperatorEnv {
  DB: D1Database;
  OPERATOR_KEY: string;
  OIDC_LOCAL_PROFILE?: string;
}
export default {
  async fetch(request: Request, env: OperatorEnv) {
    if (
      request.method !== 'POST' ||
      request.headers.get('x-local-operator-key') !== env.OPERATOR_KEY
    )
      return new Response(null, { status: 404 });
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 1048576)
      return new Response(null, { status: 413 });
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response(null, { status: 400 });
    }
    const input = parseAccountLinkInput(payload, env.OIDC_LOCAL_PROFILE);
    if (!input)
      return Response.json({ ok: false, code: 'LINK_INPUT_INVALID', known: true }, { status: 400 });
    try {
      let result: string;
      if (input.method === 'inspect' && input.args.length === 3)
        result = await inspect(env, input.args[0], input.args[1], input.args[2]);
      else if (input.method === 'apply' && input.args.length === 1)
        result = await apply(env, input.args[0]);
      else if (input.method === 'revoke' && input.args.length === 2)
        result = await revoke(env, input.args[0], input.args[1]);
      else if (input.method === 'lookup' && input.args.length === 1)
        result = JSON.stringify(await lookupLinkReceipt(repository(env), input.args[0]));
      else if (input.method === 'profile' && input.args.length === 0) result = await profile(env);
      else return Response.json({ ok: false, code: 'OPERATOR_INPUT_INVALID' }, { status: 400 });
      return new Response(result, { headers: { 'content-type': 'application/json' } });
    } catch (error) {
      return Response.json(
        {
          ok: false,
          code: error instanceof AccountLinkError ? error.code : 'OWNER_STORAGE_FAILURE',
          known: error instanceof AccountLinkError,
        },
        { status: 409 },
      );
    }
  },
};
function repository(env: OperatorEnv) {
  return new RequestRepository(env.DB);
}
async function inspect(env: OperatorEnv, issuer: string, subject: string, target: LinkTarget) {
  return JSON.stringify(await inspectLink(repository(env), issuer, subject, target));
}
async function apply(env: OperatorEnv, command: LinkCommand) {
  return JSON.stringify(await applyLink(repository(env), command));
}
async function revoke(
  env: OperatorEnv,
  receipt: LinkReceipt,
  context: Parameters<typeof revokeLink>[2],
) {
  return JSON.stringify(await revokeLink(repository(env), receipt, context));
}
async function profile(env: OperatorEnv) {
  const schema = (
    await env.DB.prepare(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    ).all()
  ).results;
  const ledgerTable = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE name='d1_migrations'",
  ).first();
  const migrations = ledgerTable
    ? (await env.DB.prepare('SELECT id,name FROM d1_migrations ORDER BY id').all()).results
    : [];
  return JSON.stringify({ schema, migrations });
}
