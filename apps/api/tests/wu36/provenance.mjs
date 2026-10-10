import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
export const evidence=resolve(root,'docs/poc/evidence/WU-36');
const tree=directory=>readdirSync(resolve(root,directory),{withFileTypes:true}).flatMap(row=>row.isDirectory()?tree(directory+'/'+row.name):[directory+'/'+row.name]);
export const inputs=()=>[...tree('apps/api/src').filter(p=>!p.includes('/migrations/')),...tree('packages/contracts/src'),...tree('packages/domain/src'),...['wu32','wu33','wu34','wu35','wu36'].flatMap(unit=>tree('apps/api/tests/'+unit)),...tree('apps/web/src'),...tree('packages/ui/src'),...tree('tests/visual/files'),...tree('tests/visual/reference'),...tree('tests/visual/foundation'),...tree('tests/visual/tasks'),...tree('.reference/gr8r-studio/src'),'.reference/gr8r-studio/index.html','.reference/gr8r-studio/package.json','.reference/gr8r-studio/package-lock.json', 'apps/web/vite.config.ts','apps/api/scripts/seed-data.mjs','apps/api/scripts/seed-local.mjs','apps/api/src/db/migrations/0000_freezing_greymalkin.sql','apps/api/wrangler.jsonc','apps/api/package.json','apps/web/src/data/adapters/http.ts','apps/web/src/data/operations.ts','apps/web/src/data/errors.ts','apps/web/src/features/tasks/loadTaskViewDataset.ts','apps/web/src/data/mock/notifications.ts','apps/web/src/data/mock/dashboards.ts','apps/web/src/data/mock/search.ts','apps/web/src/data/mock/archive.ts','apps/web/src/data/mock/projects.ts','apps/web/src/data/mock/settings.ts','docs/poc/reference/source-fixture.json','docs/poc/reference/source-lock.json','docs/poc/reference/baseline-manifest.json','docs/poc/reference/font-assets.json','pnpm-lock.yaml','package.json','eslint.config.mjs','turbo.json','tsconfig.base.json','apps/web/tsconfig.json','apps/api/tsconfig.json','apps/api/drizzle.config.ts','apps/web/.env.example'];
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function captureInputs(directory) {
  mkdirSync(directory,{recursive:true});mkdirSync(resolve(evidence,'inputs'),{recursive:true});
  const map=[...new Set(inputs())].map(path=>{const bytes=readFileSync(resolve(root,path)),sha256=hash(bytes),snapshot=resolve(evidence,'inputs',sha256+'.json');if(!existsSync(snapshot))writeFileSync(snapshot,JSON.stringify({encoding:'base64',bytes:bytes.length,sha256,content:bytes.toString('base64')})+'\n');return {path,bytes:bytes.length,sha256,snapshot:relative(root,snapshot)};});
  writeFileSync(resolve(directory,'executed-inputs.json'),JSON.stringify({capturedAt:new Date().toISOString(),files:map},null,2)+'\n');return map;
}

export function captureBuild(directory,folders) {
 const rows=folders.flatMap(folder=>tree(folder)).map(path=>{const bytes=readFileSync(resolve(root,path)),sha256=hash(bytes),snapshot=resolve(evidence,'inputs',sha256+'.json');if(!existsSync(snapshot))writeFileSync(snapshot,JSON.stringify({encoding:'base64',bytes:bytes.length,sha256,content:bytes.toString('base64')})+'\n');return {path,bytes:bytes.length,sha256,snapshot:relative(root,snapshot)};});
 writeFileSync(resolve(directory,'executed-builds.json'),JSON.stringify({beforeInvocation:true,files:rows},null,2)+'\n');return rows;
}
