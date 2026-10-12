import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedRows, seedSql } from './seed-data.mjs';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--persist-to'))
  throw new Error('Only --persist-to PATH is allowed; seed is local only');
const folder = mkdtempSync(join(tmpdir(), 'task8-d1-seed-'));
try {
  const seed = seedRows(),
    file = join(folder, 'seed.sql');
  writeFileSync(file, seedSql(seed));
  const result = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--file', file, ...args],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else
    console.log(
      JSON.stringify({
        provenance: seed.provenance,
        primary: seed.primary,
        isolation: seed.isolation,
        rows: Object.fromEntries(Object.entries(seed.rows).map(([k, v]) => [k, v.length])),
        idempotency: 'ON CONFLICT DO NOTHING; existing rows never overwritten',
      }),
    );
} finally {
  rmSync(folder, { recursive: true, force: true });
}
