import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const unit = process.argv.find(arg => ['WU-07', 'WU-08', 'WU-09', 'WU-10', 'WU-11', 'WU-12', 'WU-13', 'WU-14', 'WU-15', 'WU-16'].includes(arg)) ?? 'WU-06';
const evidence = `docs/poc/evidence/${unit}${process.argv.includes('--table-popovers') ? '/table-popovers' : ''}`;
const dist = new URL('apps/web/dist-http/', root);
const graph = JSON.parse(readFileSync(new URL('module-graph.json', dist), 'utf8'));
const forbidden = /\/data\/mock\/|\/adapters\/mock(?:-entry)?\.ts|source-identities\.ts|source-fixture\.json|\/\.reference\//;
assert(!graph.some(id => forbidden.test(id)), 'HTTP module graph contains mock/source modules');
assert(graph.some(id => id.endsWith('/data/adapters/http-entry.ts')));
assert(graph.some(id => id.endsWith('/data/adapters/http.ts')));
const assets = readdirSync(new URL('assets/', dist)).filter(name => name.endsWith('.js'));
const files = assets.map(name => {
  const bytes = readFileSync(new URL(`assets/${name}`, dist));
  const code = bytes.toString('utf8');
  for (const marker of ['task8.mock.v1', 'gr8r.v2', 'SourceIdentitySchema', 'homepage-wireframes-v3.fig', 'Audit existing navigation', 'Mock scenario request failed', '904205c626918ee96054eb35495c394a60c0c601']) assert(!code.includes(marker), `Mock/source marker in ${name}`);
  return { path: `apps/web/dist-http/assets/${name}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const report = { status: 'passed', graphModules: graph.length, forbiddenModules: [], files, mode: 'http', entry: 'apps/web/index.html', graphPath: 'apps/web/dist-http/module-graph.json' };
writeFileSync(new URL(`${evidence}/http-bundle.json`, root), JSON.stringify(report, null, 2) + '\n');
writeFileSync(new URL(`${evidence}/http-module-graph.json`, root), JSON.stringify(graph, null, 2) + '\n');
console.log(JSON.stringify(report));
