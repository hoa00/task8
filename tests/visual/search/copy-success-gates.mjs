import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const root='docs/poc/evidence/WU-18', output=`${root}/copy-success-commands.json`;assert.equal(fs.existsSync(output),false);
const commands=[
 ['typecheck',['pnpm',['typecheck']],`${root}/typecheck-final-08.log`],
 ['build',['pnpm',['build']],`${root}/build-fourteenth.log`],
 ['current-affected-capture',[process.execPath,['tests/visual/search/verify.mjs','--file-preview-only','--attempt=file-copy-success-01']],`${root}/attempts/file-copy-success-01.log`,'file-copy-success-01'],
 ['current-affected-visual',[process.execPath,['tests/visual/search/post-success.mjs']],`${root}/post-success-verification.log`],
 ['native-feedback',[process.execPath,['tests/visual/search/interactions.mjs','--feedback-only','--attempt=native-09']],`${root}/attempts/native-09.log`,'native-09'],
 ['source-copy-feedback',[process.execPath,['tests/visual/search/source-copy-feedback.mjs','--attempt=source-copy-feedback-02']],`${root}/attempts/source-copy-feedback-02.log`,'source-copy-feedback-02'],
 ['http-build',['pnpm',['--filter','@studio/web','build:http']],`${root}/http-build-final-04.log`],
 ['http-bundle',[process.execPath,['tests/data/http-bundle.mjs','WU-18']],`${root}/http-bundle-final-05.log`],
 ['lint',['pnpm',['lint']],`${root}/lint-final-10.log`],
 ['source-reference',[process.execPath,['tests/visual/reference/source-check.mjs']],`${root}/reference-final-05.log`],
 ['archive-audit',[process.execPath,['tests/visual/search/archive-audit.mjs',`--output=${root}/archive-audit-final02.json`]],`${root}/archive-audit-final02.log`],
];
const results=[];
for(const[name,[command,args],log,attempt]of commands){const startedAt=new Date().toISOString(),result=spawnSync(command,args,{encoding:'utf8',env:process.env});fs.writeFileSync(log,`${result.stdout??''}${result.stderr??''}`);results.push({name,command:[command,...args],exitStatus:result.status,signal:result.signal,startedAt,completedAt:new Date().toISOString(),log});fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n');console.log(`${name}: actual exit ${result.status}`);if(attempt){const frozen=spawnSync(process.execPath,['tests/visual/search/freeze.mjs',`--attempt=${attempt}`],{encoding:'utf8',env:process.env});fs.writeFileSync(`${root}/${attempt}-freeze.log`,`${frozen.stdout??''}${frozen.stderr??''}`);assert.equal(frozen.status,0);}if(result.status!==0)process.exit(result.status??1);}
