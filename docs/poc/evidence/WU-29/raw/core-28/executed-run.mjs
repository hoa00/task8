import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const attempt = process.argv[2];
const argv = process.argv.slice(3);
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || !argv.length) throw Error('Unique attempt and exact argv required');
const directory = `docs/poc/evidence/WU-29/raw/${attempt}`;
if (fs.existsSync(directory)) throw Error('Never overwrite an attempt');
fs.mkdirSync(directory, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const write = (path, bytes) => {
  fs.writeFileSync(path, bytes, { flag: 'wx' });
  return { path, bytes: bytes.length, sha256: hash(bytes) };
};
const command = write(`${directory}/command.txt`, Buffer.from(`${argv.map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ')}\n`));
write(`${directory}/executed-run.mjs`, fs.readFileSync(import.meta.filename));
const out = fs.openSync(`${directory}/stdout`, 'wx');
const err = fs.openSync(`${directory}/stderr`, 'wx');
const startedAt = new Date().toISOString();
const result = spawnSync(argv[0], argv.slice(1), { stdio: ['ignore', out, err] });
fs.closeSync(out);
fs.closeSync(err);
const record = path => { const bytes = fs.readFileSync(path); return { path, bytes: bytes.length, sha256: hash(bytes) }; };
const execution = { argv, command, startedAt, finishedAt: new Date().toISOString(), node: process.version, exitStatus: result.status, signal: result.signal, error: result.error?.code ?? null, stdout: record(`${directory}/stdout`), stderr: record(`${directory}/stderr`) };
write(`${directory}/execution.json`, Buffer.from(`${JSON.stringify(execution, null, 2)}\n`));
console.log(JSON.stringify({ attempt, exitStatus: result.status, stdout: execution.stdout.bytes, stderr: execution.stderr.bytes }));
process.exitCode = result.status ?? 1;
