import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHarness, localFetch } from '/Users/hoadev/Projects/ai-v3/task8-react/apps/api/tests/support/harness.mjs';
const report = { commands: [], probes: [] };
const harness = await createHarness('auth-live-transport-diagnostic', report);
const config = resolve(report.run.runtime, 'probe.json');
writeFileSync(config, JSON.stringify({ name: 'task8-auth-transport-diagnostic', main: '/tmp/task8-auth-live-transport.worker.ts', compatibility_date: '2026-10-08', compatibility_flags: ['nodejs_compat'], send_metrics: false }));
try {
  await harness.launch('probe-worker', ['pnpm', 'exec', 'wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(harness.port), '--inspector-port', '0', '--config', config]);
  const response = await localFetch(harness.baseUrl, { signal: AbortSignal.timeout(30000) });
  const result = await response.json(); report.probes.push(result); console.log(JSON.stringify(result));
} finally { await harness.cleanup(); console.log(JSON.stringify({ report: harness.out + '/report.json', ownedWorker: 'stopped' })); }
