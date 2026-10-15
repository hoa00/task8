import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildImportGraph } from '../../tests/workspace/import-graph.mjs';
import { validatePackageEdge } from '../../tests/workspace/boundaries.mjs';
const root=path.resolve('test-results/fr01-baseline/old-boundary-fixture');
for(const owner of ['ui','contracts','domain']) {
 fs.mkdirSync(`${root}/packages/${owner}/src`,{recursive:true});
 fs.writeFileSync(`${root}/packages/${owner}/package.json`,'{}');
}
fs.writeFileSync(`${root}/packages/contracts/src/secret.ts`,'export const secret = 1;');
fs.mkdirSync(`${root}/tests/workspace`,{recursive:true});
fs.writeFileSync(`${root}/tests/workspace/boundaries.mjs`,execFileSync('git',['show','edda6111:tests/workspace/boundaries.mjs']));
const results=[];
for(const kind of ['dynamic','require']) {
 fs.writeFileSync(`${root}/packages/ui/src/escape.ts`,kind==='dynamic'?"export const secret = import('../../contracts/src/secret.ts');":"export const secret = require('../../contracts/src/secret.ts');");
 const previous=await import(pathToFileURL(`${root}/tests/workspace/boundaries.mjs`));
 const old=previous.checkBoundaries();
 const edges=buildImportGraph(root,['packages/ui/src']);
 assert.throws(()=>validatePackageEdge('ui',edges[0]),/another package or app/);
 results.push({kind,baselineGate:old.status,baselineIncorrectlyAccepted:true,currentRejected:true});
}
console.log(JSON.stringify({baseline:'edda6111',results},null,2));
