import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { artifacts, sha256 } from '../reference/source-check.mjs';
export function immutableInputs() { return Object.fromEntries(['baseline-manifest.json','font-assets.json','source-fixture.json','source-lock.json'].map(name=>[name,sha256(fs.readFileSync(`${artifacts}/${name}`))])); }
export function implementationAssets() { const files = execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','apps/web/src','packages','apps/web/vite.config.ts','package.json','pnpm-lock.yaml'],{encoding:'utf8'}).trim().split('\n').filter(Boolean); function walk(dir) { for (const row of fs.readdirSync(dir,{withFileTypes:true})) { const file=`${dir}/${row.name}`; if(row.isDirectory())walk(file);else files.push(file); } } walk('apps/web/dist'); return Object.fromEntries([...new Set(files)].sort().map(file=>[file,sha256(fs.readFileSync(file))])); }
export function httpBuildAssets() { const files=[];function walk(dir){for(const row of fs.readdirSync(dir,{withFileTypes:true})){const file=`${dir}/${row.name}`;if(row.isDirectory())walk(file);else files.push(file);}}walk('apps/web/dist-http');return Object.fromEntries(files.sort().map(file=>[file,sha256(fs.readFileSync(file))])); }

export function sourceAssets() { const root='.reference/gr8r-studio';return Object.fromEntries(execFileSync('git',['-C',root,'ls-files'],{encoding:'utf8'}).trim().split('\n').map(file=>[`${root}/${file}`,sha256(fs.readFileSync(`${root}/${file}`))])); }
