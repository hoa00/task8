import { RequestRepository } from '../src/db/client.ts';
import { explicitlyLinkIdentity, type LinkIdentityInput } from '../src/modules/members/index.ts';
import { serverClock } from '../src/shared/clock.ts';
import { newId } from '../src/shared/ids.ts';
import { ApiFailure } from '../src/shared/errors.ts';

export default {
  async fetch(request: Request, env: CloudflareBindings & { LINK_INPUT: string }) {
    if (
      env.STUDIO_ENV !== 'local' ||
      request.method !== 'POST' ||
      new URL(request.url).pathname !== '/link'
    )
      return Response.json({ error: 'Local operator procedure only' }, { status: 404 });
    try {
      const input: LinkIdentityInput = JSON.parse(env.LINK_INPUT);
      const result = await explicitlyLinkIdentity(new RequestRepository(env.DB), input, {
        clock: serverClock,
        generateId: newId,
      });
      return Response.json({ data: result });
    } catch (error) {
      return Response.json(
        { error: error instanceof ApiFailure ? error.code : 'AUTH_SERVICE_UNAVAILABLE' },
        { status: error instanceof ApiFailure && error.code === 'CONFLICT' ? 409 : 400 },
      );
    }
  },
};
