import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { sha256 } from '../reference/source-check.mjs';
import { implementationAssets, httpBuildAssets } from './assets.mjs';
const attempt=process.argv.find(a=>a.startsWith('--attempt='))?.slice(10),out=`docs/poc/evidence/WU-22/archives/${attempt}`;if(!attempt||fs.existsSync(out))throw Error('Unique archive required');const assets={...implementationAssets(),...httpBuildAssets()};for(const[file,hash]of Object.entries(assets)){const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);assert.equal(sha256(fs.readFileSync(target)),hash);}fs.copyFileSync('tests/visual/files/archive.mjs',`${out}/executed-archive.mjs`);fs.writeFileSync(`${out}/manifest.json`,JSON.stringify({kind:'Actual source and both built predecessors before edits',assets},null,2)+'\n');console.log(JSON.stringify({attempt,actualArchivedBytes:Object.keys(assets).length}));
