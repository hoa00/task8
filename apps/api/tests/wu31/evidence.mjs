import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
const root=process.cwd(),out=resolve(root,'docs/poc/evidence/WU-31');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const receipt=path=>{const bytes=readFileSync(path);return {path:relative(root,path),bytes:bytes.length,sha256:hash(bytes)};};
const json=path=>JSON.parse(readFileSync(path));
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(resolve(dir,entry.name)):[resolve(dir,entry.name)]);
const commands=files(resolve(out,'commands')).filter(path=>path.endsWith('/result.json')).map(path=>{
  const row=json(path);for(const field of ['stdout','stderr']){const actual=receipt(resolve(path,'..',row[field].path));assert.equal(actual.bytes,row[field].bytes);assert.equal(actual.sha256,row[field].sha256);}return {...row,result:receipt(path)};
});
const selected=['d1-04','guards-01'].map(name=>{
  const dir=resolve(out,'attempts',name),path=resolve(dir,'report.json'),report=json(path);assert.equal(report.status,'PASS');
  for(const command of report.commands){for(const field of ['stdout','stderr']){const actual=receipt(resolve(dir,command[field].path));assert.equal(actual.bytes,command[field].bytes);assert.equal(actual.sha256,command[field].sha256);}if(command.shutdown)assert.equal(command.signal,'SIGTERM');else assert.equal(command.exitCode,0);}
  const budgets=report.probes.flatMap(p=>p.budget?[p.budget]:[]);assert(budgets.every(b=>b.queries<=50&&b.parameters<=100));
  const sourceMatches=files(resolve(dir,'executed')).map(path=>{
    const name=relative(resolve(dir,'executed'),path);const candidates=files(resolve(root,'apps/api/src')).concat(files(resolve(root,'apps/api/tests/wu31'))).filter(file=>file.endsWith('/'+name));assert.equal(candidates.length,1);assert.deepEqual(readFileSync(path),readFileSync(candidates[0]));return {executed:receipt(path),current:receipt(candidates[0])};
  });
  return {report:receipt(path),commands:report.commands.length,probes:report.probes.length,instrumentedRequests:budgets.length,maxQueries:Math.max(...budgets.map(b=>b.queries)),maxParameters:Math.max(...budgets.map(b=>b.parameters)),sourceMatches,acceptance:report.acceptance};
});
const verification={workUnit:'WU-31',status:'REQUIRED_CHECKS_PASS_ROOT_GATE_PENDING',base:'a6b21efe50781d1bba5689081d16123ae9887887',runtime:{node:'24.13.0',pnpm:'11.19.0',wrangler:'4.148.0',database:'actual local Wrangler D1',os:'Linux'},selected,commands,scope:{coreProjectOperations:11,teamOperations:6,undoKinds:['project.archive','project.delete','team.delete'],profiles:'current user only; all membership versions atomically invalidated',capabilities:{teams:'implemented',projects:'unavailable until WU34 seven remaining operations',otherFuture:'unavailable'},limits:{queries:50,parameters:100,undoTargets:128,undoUtf8Bytes:65536,copyTasks:128,copyCombinedRows:512}},qualification:{historicalM2:'bounded; failed/missing-byte/SVG/default/Darwin obligations unchanged, not recovered',d1_03:'PASS174 on earlier profile bytes; superseded by d1_04 for current acceptance',failedOriginals:['typecheck-01 sandbox spawnSync pnpm EPERM','typecheck-02 request schema name and optional PATCH typing','typecheck-04 narrow text replacement typo','d1-01 harness secondary row lookup in primary-only seed rows','d1-02 harness expected413 versus contracted VIEW_SCOPE_TOO_LARGE409'],outerReceipts:'Original returned D1-04 completion object retained. Other early tool wrapper objects were not persisted; exact child argv/stdout/stderr/status retained, no reconstructed-original claim.',notRun:['optional browser/visual campaign','remote D1/R2/provider','production deploy','CI','future WU32–36']}};
writeFileSync(resolve(out,'verification.json'),JSON.stringify(verification,null,2)+'\n');
console.log(JSON.stringify({status:verification.status,selected:selected.map(s=>({report:s.report,probes:s.probes,commands:s.commands,maxQueries:s.maxQueries,maxParameters:s.maxParameters})),commandRecords:commands.length}));
