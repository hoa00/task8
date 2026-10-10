import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { sourceServer } from '../reference/source-server.mjs';
import { targetServer, ready } from '../tasks/verify.mjs';
import { readiness } from '../reference/source-driver.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, readJson, sha256, checkSource } from '../reference/source-check.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';
import { createSeedDataset, seedProvenance } from '../../../apps/web/src/data/mock/seed.ts';
import { mockStorageKey } from '../../../apps/web/src/data/mock/persistence.ts';
import { workspaceId } from './matrix.mjs';

const attempt=process.argv[2],output=`docs/poc/evidence/WU-29/attempts/${attempt}`;
if(!/^[a-z0-9-]+$/.test(attempt??'')||fs.existsSync(output))throw Error('Unique native glyph diagnostic required');
fs.mkdirSync(output,{recursive:true});fs.copyFileSync(import.meta.filename,`${output}/executed-harness.mjs`);
const assets=()=>({...implementationAssets(),...httpBuildAssets(),...sourceAssets()});
const report={status:'running',scope:'Predetermined three independent desktop normal native New-task contexts on BOTH Source and Target. Actual original Due-date and Close SVG drawing/geometry/CTM/styles and compositor layers are measured. First settled/native repeats and original finite CSS400 frames remain raw. All pairwise independent same-side and raw cross comparisons are partitioned by the two measured SVG boxes; this diagnostic does not automatically accept noise, use a tolerance/mask, or select a best pair.',runtime:{node:process.version,...environment},assetsBefore:assets(),immutableBefore:immutableInputs(),cycles:[],comparisons:[]};
const save=()=>fs.writeFileSync(`${output}/report.json`,`${JSON.stringify(report,null,2)}\n`);
const store=(name,bytes)=>{const path=`${output}/${name}`;fs.writeFileSync(path,bytes,{flag:'wx'});return{path,bytes:bytes.length,sha256:sha256(bytes)};};
const measure=(page,side)=>page.evaluate(side=>{
 const root=document.querySelector(side==='source'?'.modal':'[data-task-form]');
 const selectors=side==='source'?['[data-pop=date][data-field=due] svg','button[aria-label=Close] svg']:['button[aria-label="Due date"] svg','button[aria-label=Close] svg'];
 const names=['due','close'],style=el=>{const css=getComputedStyle(el);return Object.fromEntries(['color','fill','stroke','strokeWidth','opacity','transform','transformOrigin','filter','animationName','animationDuration','animationDelay','animationFillMode','animationTimingFunction','backgroundColor'].map(key=>[key,css[key]]));};
 return{owners:[...document.querySelectorAll(side==='source'?'.modal,.scrim':'[data-task-form],[data-overlay-scrim]')].map(el=>({rect:el.getBoundingClientRect().toJSON(),style:style(el),animations:el.getAnimations().map(a=>({name:a.animationName,time:a.currentTime,state:a.playState,timing:a.effect.getTiming(),frames:a.effect.getKeyframes()}))})),glyphs:selectors.map((selector,index)=>{const svg=root.querySelector(selector);if(!svg)throw Error(`Missing actual ${names[index]} SVG`);return{id:names[index],rect:svg.getBoundingClientRect().toJSON(),matrix:svg.getScreenCTM().toJSON(),style:style(svg),drawing:[...svg.querySelectorAll('*')].map(el=>({tag:el.tagName,attributes:Object.fromEntries([...el.attributes].filter(a=>!['class','style'].includes(a.name)).map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b)))})),ancestors:[svg.parentElement,root].map(el=>({rect:el.getBoundingClientRect().toJSON(),style:style(el)}))};})};
},side);
const partition=(a,b,regions)=>{const x=PNG.sync.read(fs.readFileSync(a.path)),y=PNG.sync.read(fs.readFileSync(b.path));assert.equal(x.width,y.width);assert.equal(x.height,y.height);let inside=0,outside=0;const bounds=[x.width,x.height,-1,-1];for(let index=0;index<x.width*x.height;index++){const offset=index*4;if(x.data.subarray(offset,offset+4).equals(y.data.subarray(offset,offset+4)))continue;const px=index%x.width,py=Math.floor(index/x.width);if(regions.some(rect=>px>=Math.floor(rect.left)&&px<Math.ceil(rect.right)&&py>=Math.floor(rect.top)&&py<Math.ceil(rect.bottom)))inside++;else outside++;bounds[0]=Math.min(bounds[0],px);bounds[1]=Math.min(bounds[1],py);bounds[2]=Math.max(bounds[2],px);bounds[3]=Math.max(bounds[3],py);}return{a,b,pixels:inside+outside,inside,outside,bounds:inside+outside?bounds:null,regions};};
let browser,stopSource,stopTarget;
try{
 stopSource=await sourceServer();stopTarget=await targetServer();checkSource();browser=await chromium.launch({headless:true,args:['--disable-partial-raster']});report.runtime.browser=browser.version();const browserCdp=await browser.newBrowserCDPSession();report.runtime.arguments=(await browserCdp.send('Browser.getBrowserCommandLine')).arguments;await browserCdp.detach();
 for(let cycle=0;cycle<3;cycle++){
  const fixture=readJson(`${artifacts}/source-fixture.json`),dataset=createSeedDataset(),prefs={theme:'light',accent:'indigo',motion:'system'};Object.assign(fixture.prefs,prefs);Object.assign(dataset.preferences,prefs);
  const row={cycle,prefs,fixtures:{source:store(`${cycle}-source-fixture.json`,Buffer.from(`${JSON.stringify(fixture)}\n`)),target:store(`${cycle}-target-fixture.json`,Buffer.from(`${JSON.stringify(dataset)}\n`))},samples:[],fonts:[[],[]],errors:[[],[]]};report.cycles.push(row);save();
  const a=await newPage(browser,{},fixture),b=await newPage(browser,{},undefined,true,'http://127.0.0.1:5173'),pending=[],sessions=[a,b],layers=[null,null],cdps=[];
  try{
   for(const [side,session]of sessions.entries()){session.page.setDefaultTimeout(12000);await session.page.emulateMedia({reducedMotion:'no-preference'});session.page.on('pageerror',error=>row.errors[side].push(String(error)));session.page.on('response',response=>{if(/\.woff2(?:\?|$)/.test(response.url()))pending.push((async()=>{const bytes=await response.body();row.fonts[side].push({url:response.url(),status:response.status(),bytes:bytes.length,sha256:sha256(bytes)});})());});const cdp=await session.context.newCDPSession(session.page);cdp.on('LayerTree.layerTreeDidChange',event=>{layers[side]=event.layers;});await cdp.send('LayerTree.enable');cdps.push(cdp);}
   await b.context.addInitScript(({prefs,dataset,key,fixtureSha256})=>{localStorage.setItem('task8.ui.theme.v1',JSON.stringify(prefs));localStorage.setItem(key,JSON.stringify({schemaVersion:1,fixtureSha256,dataset}));},{prefs,dataset,key:mockStorageKey(workspaceId),fixtureSha256:seedProvenance.fixtureSha256});
   await a.page.goto('http://127.0.0.1:4173/#tasks');await a.page.waitForFunction(()=>!!window.__gr8r);await b.page.goto(`http://127.0.0.1:5173/w/${workspaceId}/tasks`);await readiness(a.page);await ready(b.page);
   await a.page.locator('[data-a=newTask]').first().click();await b.page.getByRole('button',{name:'New task',exact:true}).first().click();await a.page.locator('.modal').waitFor();await b.page.locator('[data-task-form]').waitFor();await b.page.waitForTimeout(400);for(const {page}of sessions)await page.mouse.move(1439,999);await Promise.all(pending);
   for(const label of ['native-settled','css-relative-400']){
    if(label==='css-relative-400'){for(const {page}of sessions)await page.evaluate(()=>{for(const animation of document.getAnimations())if(animation instanceof CSSAnimation&&animation.effect.getTiming().iterations!==Infinity){animation.pause();animation.currentTime=400;}});await b.page.waitForTimeout(50);}
    const states=await Promise.all([[a.page,'source'],[b.page,'target']].map(([page,side])=>measure(page,side))),sample={label,states,images:[]};row.samples.push(sample);save();
    for(const [side,{page}]of sessions.entries()){const image=store(`${cycle}-${label}-${side}.png`,await page.screenshot({animations:'allow',caret:'hide'})),repeat=store(`${cycle}-${label}-${side}-repeat.png`,await page.screenshot({animations:'allow',caret:'hide'}));sample.images.push({image,repeat});save();}
    sample.layers=await Promise.all(cdps.map(async(cdp,side)=>{const captured=layers[side]??[];return{layers:captured,reasons:await Promise.all(captured.filter(layer=>layer.drawsContent).map(async layer=>({layerId:layer.layerId,...await cdp.send('LayerTree.compositingReasons',{layerId:layer.layerId})}))) };}));save();
    for(let i=0;i<2;i++){assert.equal(states[i].owners.length,2);assert.equal(states[i].glyphs.length,2);const repeat=partition(sample.images[i].image,sample.images[i].repeat,states[i].glyphs.map(g=>g.rect));report.comparisons.push({kind:'same-context-repeat',cycle,label,side:i,...repeat});assert.equal(repeat.pixels,0);}
    const cross=partition(sample.images[0].image,sample.images[1].image,states.flatMap(state=>state.glyphs.map(g=>g.rect)));report.comparisons.push({kind:'raw-cross',cycle,label,...cross});save();
    for(let i=0;i<2;i++){assert.deepEqual(states[0].glyphs[i].rect,states[1].glyphs[i].rect);assert.deepEqual(states[0].glyphs[i].matrix,states[1].glyphs[i].matrix);assert.deepEqual(states[0].glyphs[i].drawing,states[1].glyphs[i].drawing);}
   }
   row.loadedFaces=await Promise.all(sessions.map(({page})=>page.evaluate(()=>[...document.fonts].filter(face=>face.status==='loaded').map(face=>({family:face.family,weight:face.weight})))));save();assert.deepEqual(row.errors,[[],[]]);for(const side of row.fonts){assert.equal(side.length,2);for(const font of side){assert.equal(font.status,200);assert.ok(readJson(`${artifacts}/font-assets.json`).assets.some(asset=>asset.sha256===font.sha256));}}for(const faces of row.loadedFaces)for(const spec of ['Geist:400','Geist:500','Geist:600','Geist Mono:400'])assert.ok(faces.some(face=>`${face.family.replaceAll('"','')}:${face.weight}`===spec));
  }finally{for(const cdp of cdps)await cdp.detach();await a.context.close();await b.context.close();}
 }
 for(let side=0;side<2;side++)for(let a=0;a<3;a++)for(let b=a+1;b<3;b++){const x=report.cycles[a].samples[0],y=report.cycles[b].samples[0];report.comparisons.push({kind:'independent-context-native',side,cycles:[a,b],...partition(x.images[side].image,y.images[side].image,[...x.states[side].glyphs,...y.states[side].glyphs].map(g=>g.rect))});}
 report.assetsAfter=assets();report.immutableAfter=immutableInputs();assert.deepEqual(report.assetsBefore,report.assetsAfter);assert.deepEqual(report.immutableBefore,report.immutableAfter);checkSource();report.status='measured-unaccepted';save();console.log(JSON.stringify({attempt,status:report.status,comparisons:report.comparisons.map(({kind,pixels,inside,outside})=>({kind,pixels,inside,outside}))}));
}catch(error){report.status='failed';report.error=String(error.stack);save();throw error;}finally{await browser?.close();await stopTarget?.();await stopSource?.();}
