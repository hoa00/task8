import assert from 'node:assert/strict';
import test from 'node:test';
import viteConfig from '../../apps/web/vite.config.ts';

function proxyFor(t, url, override) {
  for (const [key, value] of Object.entries({
    PORTLESS_URL: url,
    TASK8_API_PROXY_TARGET: override,
  })) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  return viteConfig({ command: 'serve', mode: 'development' });
}

test('Portless web forwards API to its named sibling with the same TLS origin port', (t) => {
  const config = proxyFor(t, 'https://datamaker-task.test:1355');
  assert.deepEqual(config.server.proxy['/api'], {
    target: 'https://api.datamaker-task.test:1355',
    changeOrigin: true,
  });
});

test('An explicit API proxy target takes precedence over Portless discovery', (t) => {
  const config = proxyFor(t, 'https://datamaker-task.test:1355', 'http://127.0.0.1:9898');
  assert.equal(config.server.proxy['/api'].target, 'http://127.0.0.1:9898');
});

test('Direct development and preview retain their loopback API target', (t) => {
  const config = proxyFor(t);
  assert.equal(config.server.proxy['/api'].target, 'http://127.0.0.1:8787');
  assert.deepEqual(config.preview.proxy, config.server.proxy);
});
