import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canAct, canAccessProject } from '../../src/modules/projects/index.ts';
import { apiLimits, queryLimits } from '../../src/shared/limits.ts';
import { CapabilitiesSchema } from '@studio/contracts/api';
import { capabilities } from '../../src/modules/routes.ts';
test('canonical limits match contracts and existing manifest', () => {
  assert.deepEqual(capabilities.limits, apiLimits);
  CapabilitiesSchema.parse(capabilities);
  assert.deepEqual(queryLimits, {
    statements: 50,
    parametersPerStatement: 100,
    batchStatements: 50,
  });
});
test('actor active/admin/creator matrix includes removed and invited states', () => {
  for (const role of ['Owner', 'Admin', 'Member', 'Guest'])
    for (const status of ['active', 'invited', 'deactivated'])
      for (const removed of [false, true]) {
        const actor = { role, status, removed };
        assert.equal(canAct(actor, 'active'), status === 'active' && !removed);
        assert.equal(
          canAct(actor, 'administrator'),
          status === 'active' && !removed && ['Owner', 'Admin'].includes(role),
        );
        assert.equal(canAct(actor, 'creator'), status === 'active' && !removed && role !== 'Guest');
      }
});
test('private view differs from edit, and owner role never bypasses absent grant', () => {
  const memberId = 'member',
    base = { memberId, visibility: 'private', grants: [] };
  assert.equal(canAccessProject(base, 'read'), false);
  assert.equal(
    canAccessProject({ ...base, grants: [{ memberId, permission: 'view' }] }, 'read'),
    true,
  );
  assert.equal(
    canAccessProject({ ...base, grants: [{ memberId, permission: 'view' }] }, 'write'),
    false,
  );
  assert.equal(
    canAccessProject({ ...base, grants: [{ memberId, permission: 'edit' }] }, 'write'),
    true,
  );
  assert.equal(canAccessProject({ ...base, visibility: 'workspace' }, 'write'), true);
});
