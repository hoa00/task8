import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
export function createBrowserReport(output, metadata = {}) {
  const report = { ...metadata, status: 'running', probes: [] };
  const save = () =>
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  save();
  const probe = async (id, work, { skip } = {}) => {
    assert(!report.probes.some((row) => row.id === id), `Duplicate scenario ${id}`);
    if (skip) {
      report.probes.push({ id, status: 'skipped', reason: skip });
      save();
      return;
    }
    try {
      report.probes.push({ id, status: 'passed', ...(await work()) });
    } catch (error) {
      report.probes.push({ id, status: 'failed', error: String(error.stack) });
      throw error;
    } finally {
      save();
    }
  };
  return {
    report,
    save,
    probe,
    finish: () => {
      report.status =
        !report.probes.length || report.probes.some((row) => row.status === 'failed')
          ? 'failed'
          : report.probes.some((row) => row.status === 'skipped')
            ? 'partial'
            : 'passed';
      save();
      return report;
    },
  };
}
export function browserResults(report) {
  assert(['passed', 'partial', 'failed'].includes(report.status), 'Browser report incomplete');
  const scenarios = (report.probes ?? report.cases ?? []).map((row) => ({
    id: row.id ?? row.name,
    status: row.status ?? (row.pass === true ? 'passed' : 'failed'),
    ...(row.reason ? { reason: row.reason } : {}),
  }));
  assert(
    scenarios.length &&
      scenarios.every(
        (row) => typeof row.id === 'string' && ['passed', 'failed', 'skipped'].includes(row.status),
      ),
    'Invalid browser scenarios',
  );
  assert(
    new Set(scenarios.map((row) => row.id)).size === scenarios.length,
    'Duplicate browser scenarios',
  );
  return {
    scenarios,
    status:
      report.status === 'failed' || scenarios.some((row) => row.status === 'failed')
        ? 'failed'
        : report.status === 'partial' || scenarios.some((row) => row.status === 'skipped')
          ? 'partial'
          : 'passed',
  };
}
