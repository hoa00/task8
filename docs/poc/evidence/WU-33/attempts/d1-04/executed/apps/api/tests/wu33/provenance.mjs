import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
const tree=directory=>readdirSync(resolve(root,directory),{withFileTypes:true}).flatMap(row=>row.isDirectory()?tree(directory+'/'+row.name):[directory+'/'+row.name]);
export const inputs=[...tree('apps/api/src').filter(path=>!path.includes('/migrations/')),...tree('packages/contracts/src'),...tree('packages/domain/src'),...tree('apps/api/tests/wu33'),'apps/api/scripts/seed-data.mjs','apps/api/scripts/seed-local.mjs','apps/api/src/db/migrations/0000_freezing_greymalkin.sql','apps/api/wrangler.jsonc','docs/poc/reference/source-fixture.json','docs/poc/reference/source-lock.json','docs/poc/reference/source-inventory.json','apps/web/src/data/mock/task-fields.ts','apps/web/src/data/mock/seed.ts','apps/web/src/data/mock/dataset.ts','apps/web/src/data/mock/project-access.ts','apps/web/src/data/mock/file-access.ts','apps/web/src/data/mock/transaction.ts','apps/web/src/data/errors.ts','pnpm-lock.yaml'];
export function archiveInputs(out) {for(const path of inputs){const destination=resolve(out,path);mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,readFileSync(resolve(root,path)));}}
