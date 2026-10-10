import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicEnv } from './env.ts';

test('public env defaults and explicit HTTP mode are stable', () => {
  assert.deepEqual(parsePublicEnv({}), { dataMode: 'mock', apiBaseUrl: '/api/v1' });
  assert.deepEqual(parsePublicEnv({ VITE_DATA_MODE: 'http', VITE_API_BASE_URL: '/api/v1' }), { dataMode: 'http', apiBaseUrl: '/api/v1' });
});

test('public env rejects unknown modes, external URLs and exposed secrets', () => {
  for (const input of [
    { VITE_DATA_MODE: 'unknown' },
    { VITE_API_BASE_URL: 'https://example.com/api/v1' },
    { VITE_API_BASE_URL: '//example.com/api' },
    { VITE_API_BASE_URL: '/api/../secret' },
    { VITE_API_SECRET: 'example' },
  ]) assert.throws(() => parsePublicEnv(input));
});
