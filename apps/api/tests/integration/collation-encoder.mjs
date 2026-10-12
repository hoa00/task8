import assert from 'node:assert/strict';
import { createHarness } from '../support/harness.mjs';
const report = { status: 'RUNNING', commands: [], probes: [] },
  h = await createHarness('collation-encoder', report);
try {
  await h.start('encoder', {});
  let seed = 1;
  function rnd() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  }
  const corpus = [
    '',
    'a',
    'B',
    'ä',
    'z',
    'é',
    'e\u0301',
    '\ue000',
    '\u{10000}',
    'Änne',
    'Kelvin',
    'İSTANBUL',
    '%_',
    'AXB',
    'A%_B',
    '\ud800',
    '\udfff',
    '\ufffd',
    '\u0000',
  ];
  for (let i = 0; i < 10000; i++) {
    let s = '';
    for (let j = 0, n = 1 + (rnd() % 8); j < n; j++) s += String.fromCodePoint(rnd() % 0x110000);
    corpus.push(s);
  }
  corpus.push('A\u0301', 'ΟΣ', 'ΟΣΑ', 'İ', 'K', '\uA7CE', '\uA7D2', '\uA7D4', '\uA7DA', '\uA7DC');
  const response = await fetch(h.baseUrl + '/__sql/collation', {
    method: 'POST',
    body: JSON.stringify(corpus),
  });
  if (response.status !== 200) throw new Error(await response.text());
  const result = await response.json();
  h.save('comparison.json', result);
  report.probes.push(result);
  assert.equal(result.failureCount, 0);
  assert.equal(result.utf16FailureCount, 0);
  assert.equal(result.foldingFailureCount, 0);
  assert.equal(result.dateFailureCount, 0);
  for (const sample of result.storageEcho) {
    assert.equal(
      sample.echo.jsonEcho,
      sample.input.replace(/[\uD800-\uDFFF]/g, '\uFFFD\uFFFD\uFFFD'),
    );
    assert.equal(sample.echo.boundEcho, sample.echo.jsonEcho);
  }
  report.status = 'PASS';
  await h.start('production', {}, true);
  const absent = await fetch(h.baseUrl + '/__sql/collation');
  assert.equal(absent.status, 404);
  report.probes.push({ name: 'probe-absent-from-production', status: absent.status });
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await h.cleanup();
  console.log(
    JSON.stringify({
      status: report.status,
      probes: report.probes,
      report: h.out + '/report.json',
    }),
  );
}
