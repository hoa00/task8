import { rmSync } from 'node:fs';
// Explicitly reset only this API's default Wrangler local D1 storage; no remote flags accepted.
if (process.argv.length !== 2)
  throw new Error('Reset takes no arguments and only clears apps/api/.wrangler/state/v3/d1');
rmSync(new URL('../.wrangler/state/v3/d1', import.meta.url), { recursive: true, force: true });
console.log('Reset apps/api/.wrangler/state/v3/d1; run db:migrate:local then db:seed:local');
