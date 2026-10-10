// Re-execute the current copies; see regression-adaptation.json for obsolete capability checks.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { captureInputs, evidence, hash, root } from './provenance.mjs';
const unit=process.argv[2],label=process.argv[3];if(!['32','33','34','35'].includes(unit)||!/^wu36-[a-z0-9-]+$/.test(label??''))throw Error('Unit32–35 and unique wu36 label required');
const out=resolve(evidence,'regressions',unit+'-'+label);if(existsSync(out))throw Error('Immutable attempt exists');mkdirSync(out,{recursive:true});captureInputs(out);
const argv=['node','--experimental-transform-types',`apps/api/tests/wu36/${({32:'tasks',33:'collaboration',34:'projections',35:'files'})[unit]}-regression.mjs`,label],startedAt=new Date().toISOString(),p=spawnSync(argv[0],argv.slice(1),{cwd:root,env:process.env,encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024});
const row={argv,cwd:root,startedAt,completedAt:new Date().toISOString(),exitCode:p.status,signal:p.signal,error:p.error?.message??null,reportPath:`docs/poc/evidence/WU-36/attempts/${label}/report.json`};for(const field of ['stdout','stderr']){const value=p[field]??'';writeFileSync(resolve(out,field+'.log'),value);row[field]={path:field+'.log',bytes:Buffer.byteLength(value),sha256:hash(value)};}
if(existsSync(resolve(root,row.reportPath))){const bytes=readFileSync(resolve(root,row.reportPath));row.report={bytes:bytes.length,sha256:hash(bytes),status:JSON.parse(bytes).status};}
writeFileSync(resolve(out,'result.json'),JSON.stringify(row,null,2)+'\n');console.log(JSON.stringify(row));process.exitCode=p.error?1:p.status??1;
