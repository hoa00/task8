import assert from 'node:assert/strict';
import { mkdirSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export function claimOutput(requested, prefix = 'frontend', workspace = root) {
  const base = resolve(workspace, 'test-results');
  const output = resolve(
    workspace,
    requested ?? `test-results/${prefix}-${Date.now()}-${randomUUID()}`,
  );
  const child = relative(base, output);
  assert(
    child && child !== '..' && !child.startsWith('../') && !isAbsolute(child),
    'Output must be a new directory inside test-results',
  );
  mkdirSync(base, { recursive: true });
  assert.equal(realpathSync(base), base, 'test-results must not be a symlink');
  let parent = base;
  for (const segment of relative(base, dirname(output)).split('/').filter(Boolean)) {
    parent = resolve(parent, segment);
    try {
      mkdirSync(parent);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    assert(
      realpathSync(parent) === parent && statSync(parent).isDirectory(),
      'Output parent escapes test-results',
    );
  }
  mkdirSync(output); // Atomic exclusive claim: never overwrite a prior run.
  return output;
}
