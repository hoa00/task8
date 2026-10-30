import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkspaceContext } from '../../src/shared/scope.ts';
import { queryFingerprint } from '../../src/shared/cursor.ts';
import { commandAuthority } from '../../src/modules/auth/application/command-authority.ts';
import {
  principalAuthorityParameters,
  principalAuthoritySql,
} from '../../src/modules/auth/persistence/command-authority.ts';
const userId = '01a11abd-aa80-7000-8000-000000000001',
  workspaceId = '01a11abd-aa80-7000-8000-000000000002',
  memberId = '01a11abd-aa80-7000-8000-000000000003',
  sessionId = '01a11abd-aa80-7000-8000-000000000004';
test('only explicit server-selected old modes produce neutral command authority', () => {
  const local = { user: { id: userId }, authSession: null },
    legacy = { user: { id: userId }, authSession: { id: sessionId } };
  assert.deepEqual(commandAuthority('local', local), { kind: 'local' });
  assert.deepEqual(commandAuthority('ict24h', legacy), { kind: 'ict24h' });
  for (const [mode, principal] of [
    ['oidc', local],
    ['oidc', legacy],
    [undefined, local],
    ['unknown', local],
    ['local', legacy],
    ['ict24h', local],
  ])
    assert.throws(
      () => commandAuthority(mode, principal),
      (error) => error.code === 'AUTH_SERVICE_UNAVAILABLE',
    );
  assert.throws(
    () => principalAuthorityParameters(undefined),
    (error) => error.code === 'AUTH_SERVICE_UNAVAILABLE',
  );
  assert.throws(
    () => principalAuthorityParameters({ kind: 'oidc' }),
    (error) => error.code === 'AUTH_SERVICE_UNAVAILABLE',
  );
});
test('verified session reference is required and no serialized scope rehydrates proof', async () => {
  const principal = {
    user: { id: userId },
    authSession: { id: sessionId },
    authentication: {
      mechanism: 'oidc',
      sessionId,
      issuer: 'https://identity-service.demo/api/auth',
      clientId: 'fixture-task8',
    },
  };
  const authority = commandAuthority('oidc', principal),
    scope = createWorkspaceContext(workspaceId, memberId, authority);
  assert.deepEqual(Object.keys(scope), ['workspaceId', 'memberId']);
  assert.equal(JSON.stringify(scope), JSON.stringify({ workspaceId, memberId }));
  assert.equal(
    await queryFingerprint({ scope, kind: 'tasks' }),
    await queryFingerprint({ scope: { workspaceId, memberId }, kind: 'tasks' }),
  );
  assert.equal(scope.authority.sessionId, sessionId);
  const lost = JSON.parse(JSON.stringify(scope));
  assert.throws(
    () => principalAuthorityParameters(lost.authority),
    (error) => error.code === 'AUTH_SERVICE_UNAVAILABLE',
  );
  assert.throws(
    () =>
      commandAuthority('oidc', {
        ...principal,
        authentication: { ...principal.authentication, sessionId: memberId },
      }),
    (error) => error.code === 'AUTH_SERVICE_UNAVAILABLE',
  );
  assert.equal(principalAuthorityParameters(authority)[0], sessionId);
  assert.match(principalAuthoritySql('actor.userId'), /s\.userId=actor\.userId/);
  assert.match(principalAuthoritySql('users.id'), /s\.userId=users\.id/);
});
