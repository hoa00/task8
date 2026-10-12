import { localFetch as fetch } from '../support/harness.mjs';
import assert from 'node:assert/strict';
import { createHarness } from '../support/harness.mjs';
const report = { status: 'RUNNING', commands: [], probes: [] },
  h = await createHarness('sql-compatibility', report);
try {
  await h.start('owner', {});
  const response = await fetch(h.baseUrl + '/__sql/compatibility');
  assert.equal(response.status, 200);
  const compatibility = await response.json();
  h.save('compatibility.json', compatibility);
  report.probes.push({
    name: 'installed-D1-comparator-and-text-capability',
    status: response.status,
  });
  report.compatibility = compatibility;
  report.status = Object.values(compatibility.blockers).some(Boolean)
    ? 'BLOCKED_SQL_PARITY'
    : 'COMPATIBLE_PRIMITIVES';
  report.note =
    'Capability probe is not full endpoint acceptance; production pagination is unchanged.';
  assert.equal(compatibility.blockers.localeBinary, true);
  assert.equal(compatibility.blockers.localeNoCase, true);
  assert.equal(compatibility.blockers.taskUtf16, true);
  assert.equal(compatibility.blockers.unicodeLower, true);
  assert.equal(compatibility.blockers.literalLike, true);
  assert.equal(compatibility.icu.available, false);
  await h.start('production', {}, true);
  const absence = await fetch(h.baseUrl + '/__sql/compatibility');
  assert.equal(absence.status, 404);
  report.probes.push({ name: 'probe-absent-from-production', status: absence.status });
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await h.cleanup();
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes.length,
      error: report.error ?? null,
      report: h.out + '/report.json',
    }),
  );
}
