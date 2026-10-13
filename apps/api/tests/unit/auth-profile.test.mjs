import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bootstrapProfile } from '../../src/modules/members/domain/bootstrap-profile.ts';
const profile = {
  providerKey: 'ict24h-identity',
  tenant: 'ict24h-rdn-dev',
  subject: '11111111-1111-4111-8111-111111111111',
  email: 'member@example.invalid',
};
const id = '01a11abd-aa80-7000-8000-000000000099';
test('profile mapper uses bounded Unicode names and rejects malformed surrogate before persistence', () => {
  assert.equal(
    bootstrapProfile({ ...profile, fullname: 'a'.repeat(239) + '😀' }, id).name,
    'a'.repeat(239),
  );
  assert.equal(
    bootstrapProfile({ ...profile, fullname: 'a'.repeat(238) + '😀' }, id).name,
    'a'.repeat(238) + '😀',
  );
  assert.equal(bootstrapProfile({ ...profile, fullname: '  ', username: ' Hòa ' }, id).name, 'Hòa');
  assert.equal(bootstrapProfile(profile, id).name, profile.email);
  assert.throws(
    () => bootstrapProfile({ ...profile, fullname: '\ud800'.repeat(240) }, id),
    (error) => error.code === 'AUTH_SERVICE_UNAVAILABLE',
  );
});
