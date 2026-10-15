import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildImportGraph } from './import-graph.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const allowed = {
  ui: new Set(['react', 'react-dom']),
  contracts: new Set(['zod']),
  domain: new Set(['@studio/contracts', 'parse5']),
};
export function validateImport(owner, specifier) {
  if (specifier.startsWith('.')) return;
  const packageName = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
  assert(allowed[owner].has(packageName), `${owner} cannot depend on ${packageName}`);
  if (specifier.startsWith('@studio/')) {
    const pkg = JSON.parse(
      readFileSync(
        new URL(`../../packages/${packageName.slice(8)}/package.json`, import.meta.url),
        'utf8',
      ),
    );
    const subpath = specifier === packageName ? '.' : `.${specifier.slice(packageName.length)}`;
    assert(Object.hasOwn(pkg.exports, subpath), `${owner} cannot deep import ${specifier}`);
  }
}
export function validatePackageEdge(owner, edge) {
  validateImport(owner, edge.specifier);
  if (edge.specifier.startsWith('.'))
    assert(
      edge.to?.startsWith(`packages/${owner}/src/`),
      `${owner} cannot import another package or app by relative path`,
    );
}
export function checkBoundaries() {
  const roots = Object.keys(allowed).map((owner) => `packages/${owner}/src`);
  const edges = buildImportGraph(root, roots);
  for (const owner of Object.keys(allowed)) {
    const pkg = JSON.parse(
      readFileSync(new URL(`../../packages/${owner}/package.json`, import.meta.url), 'utf8'),
    );
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }))
      validateImport(owner, dep);
    for (const edge of edges.filter((e) => e.from.startsWith(`packages/${owner}/`)))
      validatePackageEdge(owner, edge);
  }
  return { packages: Object.keys(allowed), edges: edges.length, status: 'passed' };
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(checkBoundaries()));
