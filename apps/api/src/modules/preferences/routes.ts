import { operations } from '@studio/contracts/api';
import { Hono } from 'hono';
import { jsonBody, noInput, parseRequest } from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import {
  readNotificationPreferences,
  readPreferences,
  updateNotificationPreferences,
  updatePreferences,
} from './index.ts';
export const preferenceRoutes = new Hono<ApiEnvironment>();
const W = '/workspaces/:workspaceId/me';
preferenceRoutes.get(W + '/preferences', async (c) => {
  await noInput(c);
  return c.json(
    operations.getPreferences.response.parse({
      data: await readPreferences(c.get('repository'), c.get('workspace')),
    }),
  );
});
preferenceRoutes.get(W + '/notification-preferences', async (c) => {
  await noInput(c);
  return c.json(
    operations.getNotificationPreferences.response.parse({
      data: await readNotificationPreferences(c.get('repository'), c.get('workspace')),
    }),
  );
});
preferenceRoutes.patch(W + '/preferences', async (c) => {
  const input = parseRequest(operations.updatePreferences.request, {
    workspaceId: c.get('workspace').workspaceId,
    body: await jsonBody(c),
  });
  return c.json(
    operations.updatePreferences.response.parse({
      data: await updatePreferences(
        c.get('repository'),
        c.get('workspace'),
        input.body,
        serverClock.now(),
      ),
    }),
  );
});
preferenceRoutes.patch(W + '/notification-preferences', async (c) => {
  const input = parseRequest(operations.updateNotificationPreferences.request, {
    workspaceId: c.get('workspace').workspaceId,
    body: await jsonBody(c),
  });
  return c.json(
    operations.updateNotificationPreferences.response.parse({
      data: await updateNotificationPreferences(
        c.get('repository'),
        c.get('workspace'),
        input.body,
        serverClock.now(),
      ),
    }),
  );
});
