// Current non-API verification; historical WU-06 reproduction uses its Git checkout.
import { runChecks, parseOptions } from '../frontend/check.mjs';
import { frontendChecks } from '../frontend/manifest.mjs';
const report = await runChecks(frontendChecks(), parseOptions(process.argv.slice(2)));
console.log(JSON.stringify(report));
if (report.status === 'failed') process.exitCode = 1;
