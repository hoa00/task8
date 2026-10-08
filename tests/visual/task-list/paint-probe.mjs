import fs from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { chromium } from '@playwright/test';
import { newPage } from '../reference/environment.mjs';
import { sourceServer } from '../reference/source-server.mjs';
import { readJson, artifacts } from '../reference/source-check.mjs';
import { sourcePreferences } from '../foundation/source-sample.mjs';
import { sourceIdentities } from '../../../packages/contracts/src/source-identities.ts';
import { sourceList } from './source-sample.mjs';
import { ready,targetServer } from '../tasks/verify.mjs';
const s=await sourceServer(),t=await targetServer(),browser=await chromium.launch();
try {const sample={scope:'project',state:'selected',density:'comfortable',width:1200,theme:'light'},a=await newPage(browser,{viewport:{width:1200,height:844}},readJson(`${artifacts}/source-fixture.json`)),b=await newPage(browser,{viewport:{width:1200,height:844}},undefined,true,'http://127.0.0.1:5173');
await a.page.goto('http://127.0.0.1:4173');await sourcePreferences(a.page,sample);await sourceList(a.page,sample,sourceIdentities);await b.page.goto('http://127.0.0.1:5173/task-list.html?visual=1&scope=project');await b.page.waitForSelector('[data-list-scope]');for(const page of [a.page,b.page]) {await page.mouse.move(1199,843);await ready(page);}
const props=['background','backgroundColor','borderColor','borderWidth','borderRadius','outline','boxShadow','transform','transition','height','padding','appearance','fontSize','lineHeight','position','overflow','isolation','contain','willChange'];const dump=async(page)=>page.locator('input').first().evaluate((el,props)=>({rect:el.getBoundingClientRect().toJSON(),style:Object.fromEntries(props.map(prop=>[prop,getComputedStyle(el)[prop]])),ancestors:[el.parentElement,el.parentElement.parentElement].map(el=>({tag:el.tagName,style:Object.fromEntries(props.map(prop=>[prop,getComputedStyle(el)[prop]]))}))}),props);
const before=await dump(b.page);for(let i=0;i<2;i++)await b.page.locator('[data-task-row]').nth(i).getByRole('checkbox').evaluate(el=>el.click());await b.page.evaluate(()=>document.activeElement?.blur());await ready(b.page);console.log(JSON.stringify({source:await dump(a.page),target:await dump(b.page),before},null,2));
await a.page.screenshot({path:'/tmp/wu09-paint-source.png'});await b.page.screenshot({path:'/tmp/wu09-paint-target.png'});
for(const page of [a.page,b.page])await page.locator('input').first().evaluate(el=>{el.focus();el.blur();});await Promise.all([ready(a.page),ready(b.page)]);await a.page.screenshot({path:'/tmp/wu09-paint-source-composited.png'});await b.page.screenshot({path:'/tmp/wu09-paint-target-composited.png'});
const count = suffix => { const a=PNG.sync.read(fs.readFileSync(`/tmp/wu09-paint-source${suffix}.png`)),b=PNG.sync.read(fs.readFileSync(`/tmp/wu09-paint-target${suffix}.png`));return pixelmatch(a.data,b.data,null,a.width,a.height,{threshold:0,includeAA:true}); };fs.writeFileSync('docs/poc/evidence/WU-09/input-paint-lifecycle.json',JSON.stringify({scenario:'project-selected1200',beforePixels:count(''),afterSymmetricFocusBlurPixels:count('-composited'),source:await dump(a.page),target:await dump(b.page),method:'Both ordinary focus/blur, concurrent finite transition settlement and twoRAF. No transforms, masks, style edits or tolerance changes. Source initially cold post-state and React updated post-state create differing native input edge paint caches.'},null,2)+'\n');
}finally{await browser.close();await t();await s();}
