import { RequestRepository } from '../src/db/client.ts';
import { explicitlyLinkIdentity, type LinkIdentityInput } from '../src/modules/members/index.ts';
import { serverClock } from '../src/shared/clock.ts';
import { newId } from '../src/shared/ids.ts';
import { ApiFailure } from '../src/shared/errors.ts';
import { errorHttpStatus } from '@studio/contracts/api';
import { inspectIdentityLinkStorage } from './link-identity-storage.ts';

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
      const repository = new RequestRepository(env.DB);
      const storage = await inspectIdentityLinkStorage(repository, input.userId);
      if (storage.missingTables.length)
        return Response.json(
          {
            error: 'AUTH_SERVICE_UNAVAILABLE',
            reason: 'LOCAL_SCHEMA_MISSING',
            missingTables: storage.missingTables,
          },
          { status: 503 },
        );
      if (!storage.userExists)
        return Response.json(
          { error: 'CONFLICT', reason: 'LOCAL_USER_NOT_FOUND' },
          { status: 409 },
        );
      const result = await explicitlyLinkIdentity(repository, input, {
        clock: serverClock,
        generateId: newId,
      });
      return Response.json({ data: result });
    } catch (error) {
      return Response.json(
        { error: error instanceof ApiFailure ? error.code : 'AUTH_SERVICE_UNAVAILABLE' },
        { status: error instanceof ApiFailure ? errorHttpStatus[error.code] : 503 },
      );
    }
  },
};
