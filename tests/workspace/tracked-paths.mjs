import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export function validatePortablePaths(paths) {
  const spellings = new Map();
  for (const path of paths) {
    const segments = path.split('/');
    for (let length = 1; length <= segments.length; length++) {
      const prefix = segments.slice(0, length).join('/');
      const key = prefix.normalize('NFD').toLowerCase();
      const previous = spellings.get(key);
      assert(previous === undefined || previous === prefix,
        `Case or Unicode path collision: ${previous} / ${prefix}`);
      spellings.set(key, prefix);
    }
  }
  return { paths: paths.length, status: 'passed' };
}

export function checkTrackedPaths() {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return validatePortablePaths(output.split('\0').filter(Boolean));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(checkTrackedPaths()));
