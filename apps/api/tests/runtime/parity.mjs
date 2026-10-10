import assert from 'node:assert/strict';
import { createSeedDataset } from '../../../web/src/data/mock/seed.ts';
import { readBootstrap } from '../../../web/src/data/mock/reads.ts';
import { createFixedClock } from '@studio/domain';
import { operations } from '@studio/contracts/api';
const instantFields=new Set(['createdAt','updatedAt','lastSeenAt','lastActivityAt','archivedAt']);
// Only schema Instant fields compare by epoch. Dates, IDs, text and counts stay strict.
export function canonicalBootstrap(value,key='') {
  if(instantFields.has(key) && typeof value==='string')return new Date(value).toISOString();
  if(Array.isArray(value))return value.map(item=>canonicalBootstrap(item)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalBootstrap(value[k],k)]));
  return value;
}
export function assertBootstrapParity(receipt,now) {
  const response=operations.getBootstrap.response.parse(receipt);
  const expected=operations.getBootstrap.data.parse(readBootstrap(createSeedDataset(),createFixedClock(new Date(now).toISOString())));
  assert.deepEqual(canonicalBootstrap(response.data),canonicalBootstrap(expected));
  // Project navigation order is contractual, even when other unordered lookup sets are compared by content.
  assert.deepEqual(response.data.projects.map(p=>p.project.id),expected.projects.map(p=>p.project.id));
  return {status:'PASS',instantFields:[...instantFields],timestampComparison:'same epoch milliseconds; JSON Z/.000Z not byte-identical',strict:'date-only, IDs, keys, text, counts, project order; unordered lookup/relation sets sorted for comparison'};
}
