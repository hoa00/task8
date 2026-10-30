import { createWorkspaceContext } from '../../src/shared/scope.ts';
import { Hono } from 'hono';
import { z } from 'zod';
import { RequestRepository } from '../../src/db/client.ts';
import {
  ensureExternalProfile,
  explicitlyLinkIdentity,
  type ExternalProfile,
  type LinkIdentityInput,
} from '../../src/modules/members/index.ts';
import { listMembers } from '../../src/modules/members/index.ts';
import { EntityIdSchema, MemberQuerySchema, errorHttpStatus } from '@studio/contracts/api';
import { serverClock } from '../../src/shared/clock.ts';
import { newId } from '../../src/shared/ids.ts';
import { ApiFailure } from '../../src/shared/errors.ts';

const app = new Hono<{ Bindings: CloudflareBindings & { TEST_MEMBER_ID: string } }>();
app.onError((error, context) =>
  context.json(
    { error: error instanceof ApiFailure ? error.code : 'INTERNAL_ERROR' },
    error instanceof ApiFailure ? errorHttpStatus[error.code] : 500,
  ),
);
app.get('/health', (context) => context.json({ ready: true }));
app.post('/identity', async (context) => {
  const repository = new RequestRepository(context.env.DB);
  const result = await ensureExternalProfile(
    repository,
    await context.req.json<ExternalProfile>(),
    { clock: serverClock, generateId: newId },
  );
  return context.json({
    data: result,
    statements: repository.statements,
    parameters: Math.max(...repository.trace.map((row) => row.parameters)),
  });
});
app.post('/link', async (context) => {
  const repository = new RequestRepository(context.env.DB);
  return context.json(
    await explicitlyLinkIdentity(repository, await context.req.json<LinkIdentityInput>(), {
      clock: serverClock,
      generateId: newId,
    }),
  );
});
app.post('/sql', async (context) => {
  const input = z
    .object({
      sql: z.string(),
      parameters: z.array(z.union([z.string(), z.number(), z.null()])).default([]),
    })
    .parse(await context.req.json());
  return context.json(
    await context.env.DB.prepare(input.sql)
      .bind(...input.parameters)
      .all(),
  );
});
app.get('/members/:workspaceId', async (context) => {
  const repository = new RequestRepository(context.env.DB);
  return context.json(
    await listMembers(
      repository,
      createWorkspaceContext(
        EntityIdSchema.parse(context.req.param('workspaceId')),
        EntityIdSchema.parse(context.env.TEST_MEMBER_ID),
        { kind: 'local' },
      ),
      MemberQuerySchema.parse({ limit: 200 }),
    ),
  );
});
export default app;
