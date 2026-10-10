import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
export const evidence=resolve(root,'docs/poc/evidence/WU-34');
const tree=directory=>readdirSync(resolve(root,directory),{withFileTypes:true}).flatMap(row=>row.isDirectory()?tree(directory+'/'+row.name):[directory+'/'+row.name]);
export const inputs=()=>[...tree('apps/api/src').filter(p=>!p.includes('/migrations/')),...tree('packages/contracts/src'),...tree('packages/domain/src'),...tree('apps/api/tests/wu34'),'apps/api/scripts/seed-data.mjs','apps/api/scripts/seed-local.mjs','apps/api/src/db/migrations/0000_freezing_greymalkin.sql','apps/api/wrangler.jsonc','apps/api/package.json','apps/web/src/data/adapters/http.ts','apps/web/src/data/operations.ts','apps/web/src/data/errors.ts','apps/web/src/features/tasks/loadTaskViewDataset.ts','apps/web/src/data/mock/notifications.ts','apps/web/src/data/mock/dashboards.ts','apps/web/src/data/mock/search.ts','apps/web/src/data/mock/archive.ts','apps/web/src/data/mock/projects.ts','apps/web/src/data/mock/settings.ts','docs/poc/reference/source-fixture.json','docs/poc/reference/source-lock.json','docs/poc/reference/baseline-manifest.json','docs/poc/reference/font-assets.json','pnpm-lock.yaml'];
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function captureInputs(directory) {
  mkdirSync(directory,{recursive:true});mkdirSync(resolve(evidence,'inputs'),{recursive:true});
  const map=inputs().map(path=>{const bytes=readFileSync(resolve(root,path)),sha256=hash(bytes),snapshot=resolve(evidence,'inputs',sha256+'.json');if(!existsSync(snapshot))writeFileSync(snapshot,JSON.stringify({encoding:'base64',bytes:bytes.length,sha256,content:bytes.toString('base64')})+'\n');return {path,bytes:bytes.length,sha256,snapshot:relative(root,snapshot)};});
  writeFileSync(resolve(directory,'executed-inputs.json'),JSON.stringify({capturedAt:new Date().toISOString(),files:map},null,2)+'\n');return map;
}
