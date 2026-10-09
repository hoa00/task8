import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = 'docs/poc/evidence/WU-18', continuationArg = process.argv.find(arg => arg.startsWith('--continuation')), continuation = !!continuationArg, continuationLabel = continuationArg?.split('=')[1] ?? '01', nativeAttempt = continuation ? continuationLabel === '01' ? 'native-04' : continuationLabel === '02' ? 'native-05' : continuationLabel === '03' ? 'native-06' : 'native-07' : 'native-03', output = `${root}/${continuation ? `remaining-continuation-${continuationLabel}` : 'remaining-commands'}.json`;
assert.equal(fs.existsSync(output), false, 'Executed command ledger must not be overwritten');
const gates = [
 ['http-bundle-current', ['tests/data/http-bundle.mjs','WU-18'], `${root}/http-bundle-final-03.log`],
 ['native-current', ['tests/visual/search/interactions.mjs',`--attempt=${nativeAttempt}`], `${root}/attempts/${nativeAttempt}.log`, nativeAttempt],
 ['source-native-current', ['tests/visual/search/source-journeys.mjs','--attempt=source-native-05'], `${root}/attempts/source-native-05.log`, 'source-native-05'],
 ['http-query-races-current', ['tests/visual/search/http-races.mjs','--attempt=http-races-03'], `${root}/attempts/http-races-03.log`, 'http-races-03'],
 ['overlay-default-geometry', ['tests/visual/overlays/verify.mjs','--wu18-regression','--attempt=overlay-default-01'], `${root}/attempts/overlay-default-01.log`, 'overlay-default-01'],
 ['overlay-default-lifecycle', ['tests/visual/overlays/lifecycle.mjs','--wu18-regression','--attempt=overlay-lifecycle-01'], `${root}/attempts/overlay-lifecycle-01.log`, 'overlay-lifecycle-01'],
 ['overlay-default-motion', ['tests/visual/overlays/motion.mjs','--wu18-regression','--attempt=overlay-motion-01'], `${root}/attempts/overlay-motion-01.log`, 'overlay-motion-01'],
 ['font-network-current', ['tests/visual/search/font-network.mjs','--attempt=font-network-01'], `${root}/attempts/font-network-01.log`, 'font-network-01'],
 ['reference-current', ['tests/visual/reference/source-check.mjs'], `${root}/reference-final-02.log`],
];
const results = [];
for (const [name, args, log, attempt] of gates.filter(([name]) => !continuation || name !== 'http-bundle-current')) {
 const startedAt = new Date().toISOString(), result = spawnSync(process.execPath, args, { encoding:'utf8', env:process.env });
 fs.writeFileSync(log, `${result.stdout ?? ''}${result.stderr ?? ''}`);
 results.push({ name, command:[process.execPath,...args], exitStatus:result.status, signal:result.signal, startedAt, completedAt:new Date().toISOString(), log });
 fs.writeFileSync(output, JSON.stringify(results,null,2)+'\n'); console.log(`${name}: actual exit ${result.status}`);
 if (attempt) { const frozen = spawnSync(process.execPath,['tests/visual/search/freeze.mjs',`--attempt=${attempt}`],{encoding:'utf8',env:process.env}); fs.writeFileSync(`${root}/${attempt}-freeze.log`,`${frozen.stdout ?? ''}${frozen.stderr ?? ''}`); assert.equal(frozen.status,0,'Freeze executed bytes before any rerun'); }
 if (result.status !== 0) process.exit(result.status ?? 1);
}
