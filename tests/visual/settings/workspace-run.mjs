import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../reference/source-check.mjs';
const attempt=process.argv.find(arg=>arg.startsWith('--attempt='))?.slice(10),mode=process.argv[2],root='docs/poc/evidence/WU-24';
if(!attempt||!['verify','interactions','http','source','scroll'].includes(mode))throw Error('Explicit owned mode/unique attempt required');
fs.mkdirSync(`${root}/attempts`,{recursive:true});const log=`${root}/attempts/${attempt}.log`;if(fs.existsSync(log))throw Error('Never overwrite');const fd=fs.openSync(log,'wx'),command=[process.execPath,`tests/visual/settings/workspace-${mode}.mjs`,...process.argv.slice(3)],result=spawnSync(command[0],command.slice(1),{stdio:['ignore',fd,fd]});fs.closeSync(fd);
const directory=`${root}/attempts/${attempt}`;fs.mkdirSync(directory,{recursive:true});fs.copyFileSync('tests/visual/settings/workspace-run.mjs',`${directory}/executed-run.mjs`);fs.writeFileSync(`${directory}/execution.json`,JSON.stringify({command,exitStatus:result.status,error:result.error?.code??null,log,logSha256:sha256(fs.readFileSync(log)),runtime:{node:process.version}},null,2)+'\n');
for(const args of [['tests/visual/settings/workspace-archive.mjs',`--attempt=${attempt}`],['tests/visual/settings/workspace-freeze.mjs',`--attempt=${attempt}`,'--skip-root-wrapper-log'],['tests/visual/settings/workspace-freeze.mjs',`--attempt=${attempt}-archive`,`--directory=archives/${attempt}`]]){const run=spawnSync(process.execPath,args,{stdio:'inherit'});if(run.status!==0)throw Error(`Archive/freeze exit ${run.status}`);}
console.log(JSON.stringify({mode,attempt,actualExitStatus:result.status,log}));process.exitCode=result.status??1;
