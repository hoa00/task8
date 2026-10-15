// Current safe non-API entry; old WU reproduction stays at its original SHA.
import { runChecks, parseOptions } from '../../frontend/check.mjs';
import { frontendChecks } from '../../frontend/manifest.mjs';
const args = process.argv.slice(2).map((arg) => {
  if (!arg.startsWith('--attempt=')) return arg;
  const attempt = arg.slice(10);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(attempt)) throw Error('Invalid attempt');
  return `--output=test-results/people-${attempt}`;
});
const report = await runChecks(frontendChecks(), parseOptions(args));
console.log(JSON.stringify(report));
if (report.status === 'failed') process.exitCode = 1;
