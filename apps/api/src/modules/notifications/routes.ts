import { EntityIdSchema, NotificationQuerySchema, operations } from '@studio/contracts/api';
import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  jsonBody as body,
  noInput as empty,
  parseRequest,
  readQuery as query,
} from '../../http/request.ts';
import type { ApiEnvironment } from '../../runtime.ts';
import { serverClock } from '../../shared/clock.ts';
import { listNotifications, readAllNotifications, updateNotification } from './index.ts';
type C = Context<ApiEnvironment>;
const s = (c: C) => c.get('workspace'),
  r = (c: C) => c.get('repository'),
  id = (c: C, key: string) => parseRequest(EntityIdSchema, c.req.param(key)),
  W = '/workspaces/:workspaceId';
export const notificationRoutes = new Hono<ApiEnvironment>();
notificationRoutes.get(W + '/notifications', async (c) => {
  const input = parseRequest(operations.listNotifications.request, {
    workspaceId: s(c).workspaceId,
    query: parseRequest(NotificationQuerySchema, await query(c)),
  });
  return c.json(
    operations.listNotifications.response.parse({
      data: await listNotifications(r(c), s(c), input.query),
    }),
  );
});
notificationRoutes.post(W + '/notifications/read-all', async (c) => {
  await empty(c);
  return c.json(
    operations.readAllNotifications.response.parse({
      data: await readAllNotifications(r(c), s(c), serverClock.now()),
    }),
  );
});
notificationRoutes.patch(W + '/notifications/:notificationId', async (c) => {
  const input = parseRequest(operations.updateNotification.request, {
    workspaceId: s(c).workspaceId,
    notificationId: id(c, 'notificationId'),
    body: await body(c),
  });
  return c.json(
    operations.updateNotification.response.parse({
      data: await updateNotification(
        r(c),
        s(c),
        input.notificationId,
        input.body.read,
        serverClock.now(),
      ),
    }),
  );
});
