import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sourceIdentities } from '../../../packages/contracts/src/source-identities.ts';
import { sourceServer } from '../reference/source-server.mjs';
import { artifacts, checkSource, readJson, sha256 } from '../reference/source-check.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { sourcePreferences } from '../foundation/source-sample.mjs';
import { sourceCalendar } from './source-sample.mjs';
const evidence = 'docs/poc/evidence/WU-14/diagnostics', report = { runtime: environment, status: 'diagnostic-only', pairs: [] };
const stopSource = await sourceServer(), stopTarget = await targetServer(); let browser;
function compare(a, b) { const x=PNG.sync.read(a),y=PNG.sync.read(b);assert.equal(x.width,y.width);assert.equal(x.height,y.height);return pixelmatch(x.data,y.data,null,x.width,x.height,{threshold:0,includeAA:true}); }
async function inspect(page) { return page.locator('input[aria-label="Search tasks"]').evaluate(input => { const keys=['display','position','backgroundColor','borderColor','borderWidth','borderRadius','boxShadow','padding','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','opacity','transform','filter','isolation','contain','willChange','overflow','animationName','animationDuration'];const style=element=>Object.fromEntries(keys.map(key=>[key,getComputedStyle(element)[key]]));const ancestors=[];for(let element=input.parentElement;element;element=element.parentElement)ancestors.push({tag:element.tagName,id:element.id,className:element.className,rect:element.getBoundingClientRect().toJSON(),style:style(element)});return{rect:input.getBoundingClientRect().toJSON(),style:style(input),ancestors}; }); }
try {
 browser=await chromium.launch({headless:true});report.browser=browser.version(); const a=await newPage(browser,{},readJson(`${artifacts}/source-fixture.json`)),b=await newPage(browser,{},undefined,true,'http://127.0.0.1:5173'),workspaceId=sourceIdentities.find(row=>row.collection==='workspaces'&&row.sourceId==='w1').id;
 await a.page.goto('http://127.0.0.1:4173');await sourcePreferences(a.page,{theme:'light',accent:'indigo',density:'comfortable',motion:'system'});const setup=await sourceCalendar(a.page,{scope:'workspace',mode:'month',state:'default',canonical:true},sourceIdentities);await b.page.goto(`http://127.0.0.1:5173/w/${workspaceId}/calendar?view=${encodeURIComponent(JSON.stringify({query:{sortField:'manual'},groupBy:'none'}))}`);await b.page.waitForSelector('[data-calendar-coverage=complete]');
 for(const page of[a.page,b.page]){await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(1439,999);await ready(page);await page.evaluate(()=>{window.__rasterTrusted=[];document.addEventListener('input',event=>window.__rasterTrusted.push({trusted:event.isTrusted,value:event.target.value}),{capture:true});});}
 report.setup=setup; report.geometry={source:await inspect(a.page),target:await inspect(b.page)};
 const clip={x:252,y:46,width:1188,height:954};const frames={};
 async function pair(name) { for(const page of[a.page,b.page]){await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(1439,999);await ready(page);await page.screenshot({clip,animations:'disabled',caret:'hide'});await page.screenshot({clip,animations:'disabled',caret:'hide'});}const source=await a.page.screenshot({clip,animations:'disabled',caret:'hide'}),target=await b.page.screenshot({clip,animations:'disabled',caret:'hide'});for(const[side,bytes]of[['source',source],['target',target]])fs.writeFileSync(`${evidence}/workspace-page-${name}-${side}.png`,bytes);frames[name]={source,target};report.pairs.push({name,changedPixels:compare(source,target),sourceSha256:sha256(source),targetSha256:sha256(target)}); }
 await pair('native-settlement');await a.page.evaluate(async()=>{await import('/src/shell/render.js').then(({render})=>render());});await pair('original-render-settlement');
 const sourceCount=await a.page.locator('.cal [data-drag-cal]').count(),targetCount=await b.page.locator('[data-calendar-task]').count();
 for(const page of[a.page,b.page])await page.getByRole('textbox',{name:'Search tasks',exact:true}).fill('WEB-130');await a.page.waitForFunction(()=>document.querySelectorAll('.cal [data-drag-cal]').length===1);await b.page.waitForFunction(()=>document.querySelectorAll('[data-calendar-task]').length===1);
 for(const page of[a.page,b.page])await page.getByRole('textbox',{name:'Search tasks',exact:true}).fill('');await a.page.waitForFunction(count=>document.querySelectorAll('.cal [data-drag-cal]').length===count,sourceCount);await b.page.waitForFunction(count=>document.querySelectorAll('[data-calendar-task]').length===count,targetCount);await pair('trusted-search-clear');
 report.sourceSelfDiffs={nativeVsOriginalRender:compare(frames['native-settlement'].source,frames['original-render-settlement'].source),renderVsTrustedClear:compare(frames['original-render-settlement'].source,frames['trusted-search-clear'].source)};report.trustedInputs={source:await a.page.evaluate(()=>window.__rasterTrusted),target:await b.page.evaluate(()=>window.__rasterTrusted)};report.afterGeometry={source:await inspect(a.page),target:await inspect(b.page)};report.cause='Unproved unless a concrete source rule/geometry difference is identified; no acceptance or tolerance change from this diagnostic.';checkSource();fs.writeFileSync(`${evidence}/workspace-page-raster.json`,JSON.stringify(report,null,2)+'\n');
} finally {await browser?.close();await stopTarget();await stopSource();}
