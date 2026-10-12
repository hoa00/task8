import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readKeysFor, readKeyFields } from './read-keys.mjs';
import { textKeyVersion } from '../src/shared/text-key-encoder.ts';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--persist-to' || !args[1])
  throw new Error('Usage: backfill-read-keys.mjs --persist-to PATH (local only)');
const folder = mkdtempSync(join(tmpdir(), 'task8-read-key-backfill-'));
const literal = (value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : "'" + String(value).replaceAll("'", "''") + "'";
let sequence = 0;
function execute(sql) {
  const file = join(folder, String(sequence++) + '.sql');
  writeFileSync(file, sql);
  const result = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--file', file, '--json', ...args],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000 },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
try {
  const updated = {};
  for (const [table, fields] of Object.entries(readKeyFields)) {
    let count = 0;
    for (;;) {
      const [response] = execute(
        `SELECT id,${fields.join(',')},${fields.map((field) => `hex(${field}) ${field}Bytes`).join(',')} FROM ${table} WHERE json_extract(readKeys,'$.v') IS NOT ${literal(textKeyVersion)} ORDER BY id LIMIT 40;`,
      );
      const rows = response.results;
      if (!rows.length) break;
      const commands = rows.map(
        (row) =>
          `UPDATE ${table} SET readKeys=${literal(readKeysFor(table, row))} WHERE id=${literal(row.id)} AND ${fields.map((field) => `hex(${field})=${literal(row[field + 'Bytes'])}`).join(' AND ')} AND json_extract(readKeys,'$.v') IS NOT ${literal(textKeyVersion)} RETURNING id;`,
      );
      const results = execute(commands.join('\n'));
      const changes = results.reduce((sum, result) => sum + result.results.length, 0);
      if (!changes) throw new Error('Backfill source changed; retry against current rows');
      count += changes;
    }
    updated[table] = count;
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      version: textKeyVersion,
      updated,
      scope: 'local',
      fields: 'derived readKeys only; identity/version/timestamps/history untouched',
    }),
  );
} finally {
  rmSync(folder, { recursive: true, force: true });
}
