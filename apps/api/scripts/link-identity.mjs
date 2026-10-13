import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { EntityIdSchema } from '@studio/contracts/api';
import { api, createHarness, localFetch } from '../tests/support/harness.mjs';

const args = process.argv.slice(2);
const names = ['--persist-to', '--tenant', '--subject', '--user-id'];
if (args.length !== 8 || names.some((name, index) => args[index * 2] !== name))
  throw new Error(
    'Usage: link-identity.mjs --persist-to PATH --tenant TENANT --subject CENTRAL_UUID --user-id LOCAL_UUIDv7 (local only)',
  );
const input = {
  providerKey: 'ict24h-identity',
  tenant: z.string().min(1).max(240).parse(args[3]),
  subject: z.uuid().parse(args[5]),
  userId: EntityIdSchema.parse(args[7]),
};
const report = { status: 'RUNNING', commands: [], probes: [] };
const harness = await createHarness('operator-link-identity', report);
try {
  const config = JSON.parse(readFileSync(resolve(api, 'wrangler.jsonc')));
  config.main = resolve(api, 'scripts/link-identity.worker.ts');
  config.vars = { STUDIO_ENV: 'local', LINK_INPUT: JSON.stringify(input) };
  config.d1_databases = config.d1_databases.map((row) => ({
    ...row,
    migrations_dir: resolve(api, row.migrations_dir),
  }));
  const file = resolve(harness.runtime, 'operator.json');
  writeFileSync(file, JSON.stringify(config));
  await harness.launch('operator', [
    'pnpm',
    'exec',
    'wrangler',
    'dev',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    String(harness.port),
    '--inspector-port',
    '0',
    '--config',
    file,
    '--persist-to',
    resolve(args[1]),
  ]);
  const response = await localFetch(harness.baseUrl + '/link', {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error('Explicit link failed: ' + result.error);
  report.status = 'PASS';
  console.log(JSON.stringify(result));
} catch (error) {
  report.status = 'FAIL';
  process.exitCode = 1;
  throw error;
} finally {
  await harness.cleanup();
}
