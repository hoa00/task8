import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { sha256 } from '../reference/source-check.mjs';
const root='docs/poc/evidence/WU-21',attempt=process.argv.find(arg=>arg.startsWith('--attempt='))?.slice(10);
if(!attempt)throw Error('Unique executed attempt required');const directory=`${root}/${process.argv.find(arg=>arg.startsWith('--directory='))?.slice(12)??`attempts/${attempt}`}`,manifest=`${root}/${attempt}-freeze.json`;
if(fs.existsSync(manifest))throw Error('Freeze already exists; verify it instead of overwriting');
const files=[];function walk(dir){for(const row of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,row.name);if(row.isDirectory())walk(file);else files.push(file);}}walk(directory);
for(const log of [`${root}/${attempt}.log`,`${root}/attempts/${attempt}.log`])if(fs.existsSync(log))files.push(log);
const records=Object.fromEntries(files.sort().map(file=>[file,sha256(fs.readFileSync(file))]));
const reportFile=files.find(file=>file.endsWith('/report.json'));const report=reportFile?JSON.parse(fs.readFileSync(reportFile)):undefined;
for(const sample of report?.samples??[])for(const [side,key]of[['source','sourceSha256'],['target','targetSha256'],['source-repeat','sourceRepeatSha256'],['target-repeat','targetRepeatSha256']]){if(sample[key])assert.equal(records[`${directory}/${sample.id}-${side}.png`],sample[key]);}
fs.writeFileSync(manifest,JSON.stringify({status:'FrozenActualExecutedBytes',attempt,executedStatus:report?.status,pngCount:files.filter(file=>file.endsWith('.png')).length,files:records},null,2)+'\n');console.log(JSON.stringify({attempt,files:files.length,pngCount:files.filter(file=>file.endsWith('.png')).length,executedStatus:report?.status}));
