import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { origin } from './environment.mjs';
import { reference, sha256 } from './source-check.mjs';

async function probeSource() {
  const response = await fetch(`${origin}/src/main.js?raw`, { signal: AbortSignal.timeout(1000) });
  const raw = await response.text();
  const match = /^export default ("(?:\\.|[^"\\])*")/s.exec(raw);
  if (!response.ok || !match || sha256(JSON.parse(match[1])) !== sha256(readFileSync(`${reference}/src/main.js`))) {
    throw new Error(`Port 4173 is occupied by a server that does not serve the pinned source; do not start another port`);
  }
}

export async function sourceServer() {
  try {
    await probeSource();
    return async () => {}; // Existing matching server is reused and remains owned by its caller.
  } catch (error) {
    if (!error.cause || error.cause.code !== 'ECONNREFUSED') throw error;
  }
  const child = spawn(process.execPath, [`${reference}/node_modules/vite/bin/vite.js`, '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { cwd: reference, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  const stop = async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  };
  console.log(`Owned source server: PID ${child.pid}, port 4173, cwd ${reference}`);
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (child.exitCode !== null) throw new Error(`Source server exited: ${output}`);
      try { await probeSource(); return stop; } catch (error) {
        if (!error.cause || error.cause.code !== 'ECONNREFUSED') throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Source server did not become ready: ${output}`);
  } catch (error) { await stop(); throw error; }
}
