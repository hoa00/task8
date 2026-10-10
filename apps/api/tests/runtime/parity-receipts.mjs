// Bounded verification of actual completed D1 receipts after tightening Instant comparison.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assertBootstrapParity, canonicalBootstrap } from './parity.mjs';
const label=process.argv[2]??'d1-03';assert(/^[a-z0-9-]+$/.test(label));
const base=new URL('../../../../docs/poc/evidence/WU-30/attempts/'+label+'/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,base)));
const snapshot=read('snapshot-first.json').response;
const proofs=['bootstrap.json','production-bootstrap.json'].map(name=>({path:name,sha256:createHash('sha256').update(readFileSync(new URL(name,base))).digest('hex'),...assertBootstrapParity(read(name).response,snapshot.now)}));
assert.notDeepEqual(canonicalBootstrap({name:'2026-10-08T09:00:00Z'}),canonicalBootstrap({name:'2026-10-08T09:00:00.000Z'}),'copy must remain strict');
assert.notDeepEqual(canonicalBootstrap({date:'2026-10-08'}),canonicalBootstrap({date:'2026-10-09'}),'date-only strict');
console.log(JSON.stringify({status:'PASS',actualD1ReceiptOnly:true,noRuntimeRerun:true,proofs,fieldsOnly:true,copyAndDateStrict:true},null,2));
