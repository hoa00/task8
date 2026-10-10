import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const [label,...argv]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(label??'')||!argv.length)throw new Error('Label and command required');
const out=resolve('docs/poc/evidence/WU-31/commands',label);if(existsSync(out))throw new Error('Immutable command attempt exists');mkdirSync(out,{recursive:true});
const startedAt=new Date().toISOString(),result=spawnSync(argv[0],argv.slice(1),{cwd:process.cwd(),env:process.env,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});
const row={argv,cwd:process.cwd(),startedAt,completedAt:new Date().toISOString(),exitCode:result.status,signal:result.signal,error:result.error?.message??null};
for(const field of ['stdout','stderr']){const value=result[field]??'';writeFileSync(resolve(out,field+'.log'),value);row[field]={path:field+'.log',bytes:Buffer.byteLength(value),sha256:createHash('sha256').update(value).digest('hex')};}
writeFileSync(resolve(out,'result.json'),JSON.stringify(row,null,2)+'\n');console.log(JSON.stringify(row));console.log(result.stdout??'');console.error(result.stderr??'');process.exitCode=result.status??1;
