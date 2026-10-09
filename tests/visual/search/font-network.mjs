import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, readJson, checkSource, sha256 } from '../reference/source-check.mjs';
import { sourceServer } from '../reference/source-server.mjs';
import { targetServer, ready } from '../tasks/verify.mjs';
import { sourcePreferences } from '../foundation/source-sample.mjs';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';
const attempt = process.argv.find(arg=>arg.startsWith('--attempt='))?.slice(10) ?? 'font-network-01', output = `docs/poc/evidence/WU-18/attempts/${attempt}`;
assert.equal(fs.existsSync(output),false); fs.mkdirSync(output,{recursive:true});
const manifest = readJson(`${artifacts}/font-assets.json`), fonts = manifest.assets.filter(row=>row.path.endsWith('.woff2'));
const report = {status:'running',scope:'Bounded actual fresh Source/Target local/locked font responses and loaded-face proof on current build; no new screenshots or claim of 45 Target served-font sets. Final matrix target fontRequests=[] is a collector limitation.',runtime:environment,manifestSha256:sha256(fs.readFileSync(`${artifacts}/font-assets.json`)),manifestFonts:[],sides:[]};
const save = () => fs.writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');
let browser; const stopSource=await sourceServer(), stopTarget=await targetServer();
try {
 checkSource();
 for (const asset of fonts) { const sourcePath=`${artifacts}/${asset.path}`, targetPath=`packages/ui/src/assets/${asset.path.split('/').at(-1)}`; assert.equal(sha256(fs.readFileSync(sourcePath)),asset.sha256); assert.equal(sha256(fs.readFileSync(targetPath)),asset.sha256); report.manifestFonts.push({sha256:asset.sha256,sourcePath,targetPath}); }
 browser=await chromium.launch({headless:true,args:['--disable-partial-raster']}); const session=await browser.newBrowserCDPSession(); report.runtime={...environment,browser:browser.version(),actualLaunchArguments:(await session.send('Browser.getBrowserCommandLine')).arguments}; await session.detach();
 for (const side of ['source','target']) {
  const context=await newPage(browser,{},side==='source'?readJson(`${artifacts}/source-fixture.json`):undefined,true,side==='source'?'http://127.0.0.1:4173':'http://127.0.0.1:5173'), {page}=context, row={side,responses:[],loads:[]}, pending=[];report.sides.push(row);
  page.on('response',response=>{if(/\.woff2(?:\?|$)/.test(response.url()))pending.push((async()=>{const bytes=await response.body(), hash=sha256(bytes);assert.equal(response.status(),200);assert.ok(fonts.some(asset=>asset.sha256===hash));row.responses.push({url:response.url(),status:response.status(),bytes:bytes.length,sha256:hash,contentType:response.headers()['content-type']});})());});
  await page.goto(side==='source'?'http://127.0.0.1:4173':`http://127.0.0.1:5173/w/${sourceId('workspaces','w1')}/home`);if(side==='source')await sourcePreferences(page,{theme:'light',accent:'indigo',motion:'system'});else await page.waitForSelector('[data-dashboard-ready]');await ready(page);
  row.loads=await page.evaluate(async()=>{const out=[];for(const spec of ['400 13.5px Geist','500 13.5px Geist','600 13.5px Geist','400 13.5px "Geist Mono"']){const faces=await document.fonts.load(spec,'Gr8r Ctrl WEB-109');out.push({spec,faces:faces.map(face=>({family:face.family,weight:face.weight,style:face.style,status:face.status}))});}await document.fonts.ready;return out;});
  const observed=await Promise.allSettled(pending);for(const result of observed)assert.equal(result.status,'fulfilled',result.reason?.message);
  for(const load of row.loads){assert.ok(load.faces.length);assert.ok(load.faces.every(face=>face.status==='loaded'));}assert.ok(row.responses.length>=2);save();await context.context.close();
 }
 assert.deepEqual([...new Set(report.sides[0].responses.map(row=>row.sha256))].sort(),[...new Set(report.sides[1].responses.map(row=>row.sha256))].sort());checkSource();report.status='passed';save();console.log(JSON.stringify({status:'passed',manifestFontCount:fonts.length,responses:report.sides.map(row=>({side:row.side,count:row.responses.length})),scope:report.scope}));
}catch(error){report.status='failed';report.error=String(error.stack);save();throw error;}finally{await browser?.close();await stopTarget();await stopSource();}
