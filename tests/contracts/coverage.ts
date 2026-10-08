import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { operations } from '../../packages/contracts/src/operations.ts';

const document = readFileSync(new URL('../../docs/poc/API_CONTRACT.md', import.meta.url), 'utf8');
const expected = new Set<string>();
for (const match of document.matchAll(/^\|\s*`((?:GET|POST|PATCH|PUT|DELETE)(?:\/(?:GET|POST|PATCH|PUT|DELETE))*)\s+([^`]+)`/gm)) {
  const methods = match[1];
  const shortPath = match[2];
  assert(methods && shortPath);
  const path = shortPath.replace(/^W(?=\/|$)/, '/api/v1/workspaces/{workspaceId}');
  for (const method of methods.split('/')) expected.add(`${method} ${path}`);
}
const actual = Object.values(operations).map(operation => `${operation.method} ${operation.path}`);
assert.equal(new Set(actual).size, actual.length, 'Duplicate method/path');
assert.deepEqual([...actual].sort(), [...expected].sort(), 'API_CONTRACT method/path coverage drift');
const explicitIds = [...document.matchAll(/^\|\s*`(?:GET|POST|PATCH|PUT|DELETE)\s+[^`]+`\s*\|\s*`([a-z][A-Za-z]+)`\s*\|/gm)].map(match => match[1]);
for (const id of explicitIds) assert(id && id in operations, `Missing canonical operation ID ${id}`);
const report = { unit: 'WU-02', source: 'docs/poc/API_CONTRACT.md', status: 'passed', expectedCount: expected.size, actualCount: actual.length, explicitOperationIds: [...new Set(explicitIds)], operations: Object.entries(operations).map(([operationId, operation]) => ({ operationId, method: operation.method, path: operation.path, transport: operation.transport, requestMediaType: operation.requestMediaType, successStatuses: operation.successStatuses })) };
if (process.argv.includes('--write')) writeFileSync(new URL('../../docs/poc/evidence/WU-02/operation-coverage.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, operations: undefined }));
