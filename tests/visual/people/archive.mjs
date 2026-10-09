import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../reference/source-check.mjs';
const reportFile=process.argv[2],name=process.argv[3],root=`docs/poc/evidence/WU-20/archives/${name}`;
if(!reportFile||!name||fs.existsSync(root))throw Error('Unique archive and existing actual report required');
const report=JSON.parse(fs.readFileSync(reportFile)),assets=report.implementationAssetsAfter;
assert.ok(assets&&Object.keys(assets).length);fs.mkdirSync(root,{recursive:true});
for(const [file,hash]of Object.entries(assets)){assert.equal(sha256(fs.readFileSync(file)),hash);const target=`${root}/${file}`;fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);assert.equal(sha256(fs.readFileSync(target)),hash);}
fs.writeFileSync(`${root}/manifest.json`,JSON.stringify({status:'ExactActualPredecessorArchive',reportFile,reportSha256:sha256(fs.readFileSync(reportFile)),assets},null,2)+'\n');
console.log(JSON.stringify({archive:root,files:Object.keys(assets).length,allActualHashesEqual:true}));
