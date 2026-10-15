import { spawnSync } from 'node:child_process';
import { discoverTests } from './discover.mjs';
import { root } from './output.mjs';
const files = discoverTests(root, ['apps/web/src', 'apps/web/tests']);
if (!files.length) throw Error('No web tests discovered');
const result = spawnSync(
  process.execPath,
  ['--experimental-strip-types', '--test', '--test-isolation=none', ...files],
  { cwd: root, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
