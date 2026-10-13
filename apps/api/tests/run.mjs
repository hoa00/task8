import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const features = [
  'auth-provider',
  'auth-identity',
  'auth-session',
  'auth-principal',
  'db',
  'http',
  'core',
  'tasks',
  'collaboration',
  'projections',
  'files',
  'collation-encoder',
  'read-keys-migration',
  'reads',
  'projection-reads',
];
export function selectFeatures(args) {
  if (!args.length) return features;
  if (args.length !== 2 || args[0] !== '--feature' || !features.includes(args[1]))
    throw new Error('Use --feature ' + features.join('|'));
  return [args[1]];
}

export async function runFeatures(args) {
  for (const feature of selectFeatures(args)) {
    console.log('[api integration] ' + feature);
    const file = fileURLToPath(new URL(`./integration/${feature}.mjs`, import.meta.url));
    const child = spawn(process.execPath, ['--experimental-transform-types', file], {
      stdio: 'inherit',
      env: process.env,
    });
    const result = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => accept({ code, signal }));
    });
    if (result.code !== 0 || result.signal)
      throw new Error(`${feature} failed (exit=${result.code}, signal=${result.signal})`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await runFeatures(process.argv.slice(2));
