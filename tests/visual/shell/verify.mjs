import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';
import {sourceServer} from '../reference/source-server.mjs';
import {newPage,environment} from '../reference/environment.mjs';
import {artifacts,checkSource,sha256,readJson} from '../reference/source-check.mjs';
import {sourcePreferences} from '../foundation/source-sample.mjs';
const evidence=path.resolve('docs/poc/evidence/WU-07'),output=path.resolve('test-results/WU-07');fs.mkdirSync(output,{recursive:true});fs.mkdirSync(evidence,{recursive:true});
const immutable=['baseline-manifest.json','font-assets.json','source-fixture.json','source-lock.json'];const hashes=()=>Object.fromEntries(immutable.map(name=>[name,sha256(fs.readFileSync(`${artifacts}/${name}`))]));
const before=hashes();checkSource();const stopSource=await sourceServer();
const server=spawn(process.execPath,['./node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5173','--strictPort'],{cwd:path.resolve('apps/web'),stdio:'pipe'});let logs='';server.stdout.on('data',v=>logs+=v);server.stderr.on('data',v=>logs+=v);
const report={sourceSha:'904205c626918ee96054eb35495c394a60c0c601',runtime:{node:process.version,os:os.platform(),arch:os.arch(),...environment},samples:[],geometry:[],immutableBefore:before,threshold:0,includeAA:true,maxDiffPixels:0,mask:[],limitations:['Shell-only source crops exclude Home, ProjectHeader/tabs and all future page content.','Scoped Linux evidence does not establish official Darwin173 whole-page parity or physical safe-area insets.','Symmetric programmatic state setup; trusted keyboard/mouse/navigation checked by routes.mjs.'],provenance:'Actual immutable source renderShell/render lifecycle, source fixture/font manifest and original helpers/styles. No source edit; no baseline derived from target.'};
let browser;
async function ready(page){await page.evaluate(async()=>{await document.fonts.ready;for(const weight of [400,500,600]){const faces=await document.fonts.load(`${weight} 13.5px Geist`,'Gr8r');assertFont(faces);}function assertFont(faces){if(!faces.length||faces.some(face=>face.status!=='loaded'))throw Error('Missing loaded Geist face');}for(const el of document.querySelectorAll('nav,header,button,a,svg')){getComputedStyle(el).color;el.getBoundingClientRect();}await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity&&a.playState!=='idle').map(a=>a.finished.catch(()=>{})));});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
function compare(a,b,id){const x=PNG.sync.read(a),y=PNG.sync.read(b);assert.equal(x.width,y.width);assert.equal(x.height,y.height);const d=new PNG({width:x.width,height:x.height});const pixels=pixelmatch(x.data,y.data,d.data,x.width,x.height,{threshold:0,includeAA:true});if(pixels)fs.writeFileSync(`${output}/${id}-diff.png`,PNG.sync.write(d));return pixels;}
const measure=page=>page.evaluate(()=>{const source=!!window.__gr8r;const selectors=source?{sidebar:'.side',topbar:'.topbar',bottomnav:'.bottomnav',content:'.content'}:{sidebar:'.shell-sidebar',topbar:'.shell-topbar',bottomnav:'.shell-bottomnav',content:'#main-content'};return Object.fromEntries(Object.entries(selectors).map(([k,s])=>{const el=document.querySelector(s),css=getComputedStyle(el);return [k,{rect:el.getBoundingClientRect().toJSON(),display:css.display,transform:css.transform}];}));});
const matrix=[{id:'desktop-light',width:1440,height:1000,theme:'light'},{id:'desktop-dark',width:1440,height:1000,theme:'dark'},{id:'desktop-collapsed',width:1440,height:1000,theme:'light',collapsed:true},{id:'mobile-light',width:390,height:844,theme:'light'},{id:'mobile-dark-open',width:390,height:844,theme:'dark',open:true},{id:'mobile-light-open',width:390,height:844,theme:'light',open:true},...[639,640,641,899,900,901].map(width=>({id:`boundary-${width}`,width,height:844,theme:'light',open:width<=900})),{id:'mobile-collapsed-open',width:390,height:844,theme:'light',collapsed:true,open:true}];
try{
 for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:5173')).ok)break;}catch{/* startup */}if(server.exitCode!==null)throw Error(logs);await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({headless:true});report.runtime.browser=browser.version();const fixture=readJson(`${artifacts}/source-fixture.json`);
 for(const sample of matrix){const {width,height,theme,collapsed=false,open=false,id}=sample;
 const a=await newPage(browser,{viewport:{width,height},mobile:width<=640},fixture),b=await newPage(browser,{viewport:{width,height},mobile:width<=640},undefined,true,'http://127.0.0.1:5173');
 await b.context.addInitScript(({theme,collapsed})=>{localStorage.setItem('task8.ui.theme.v1',JSON.stringify({theme,accent:'indigo',side:'comfortable',density:'comfortable',motion:'system'}));localStorage.setItem('task8.ui.shell.v1',collapsed?'collapsed':'expanded');},{theme,collapsed});
 await a.page.goto('http://127.0.0.1:4173');await sourcePreferences(a.page,{theme,accent:'indigo',motion:'system'});await a.page.evaluate(({collapsed,open})=>{const {S,render}=window.__gr8r;S.ui.collapsed=collapsed;S.ui.mnav=open;S.ui.route='home';S.ui.params={};S.ui.fx={};render();},{collapsed,open});
 await b.page.goto('http://127.0.0.1:5173');await b.page.waitForSelector('.shell-layout');if(open)await b.page.getByRole('button',{name:'Open navigation',exact:true}).evaluate(el=>el.click());
 // Move focus/pointer identically; source setup has no focus movement while target offcanvas traps focus.
 for(const page of [a.page,b.page]){await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(width-1,height-1);await ready(page);}
 if(id==='desktop-light'){const inspect=(page,source)=>page.evaluate(source=>{const el=document.querySelector(source?'.ws-logo':'.shell-workspace > span');const css=getComputedStyle(el);return {outer:el.outerHTML,rect:el.getBoundingClientRect().toJSON(),css:Object.fromEntries(['width','height','borderRadius','display','backgroundColor','overflow','lineHeight','color'].map(k=>[k,css[k]]))};},source);report.brand={source:await inspect(a.page,true),target:await inspect(b.page,false)};}
 const sourceGeometry=await measure(a.page),targetGeometry=await measure(b.page);report.geometry.push({id,source:sourceGeometry,target:targetGeometry});
 const cropList=[];
 if(width>900)cropList.push(['sidebar',{x:0,y:0,width:collapsed?52:252,height}]);
 else if(open)cropList.push(['sidebar',{x:0,y:0,width:280,height}]);
 if(!open)cropList.push(['topbar',{x:width>900?(collapsed?52:252):0,y:0,width:width-(width>900?(collapsed?52:252):0),height:width<=640?50:46}]);
 if(width<=640)cropList.push(['bottomnav',{x:0,y:height-57,width,height:57}]);
 for(const [region,clip] of cropList){const key=`${id}-${region}`;for(const page of [a.page,b.page]){await page.screenshot({clip,animations:'disabled',caret:'hide'});await page.screenshot({clip,animations:'disabled',caret:'hide'});}const source=await a.page.screenshot({clip,animations:'disabled',caret:'hide'}),sourceRepeat=await a.page.screenshot({clip,animations:'disabled',caret:'hide'}),target=await b.page.screenshot({clip,animations:'disabled',caret:'hide'}),targetRepeat=await b.page.screenshot({clip,animations:'disabled',caret:'hide'});fs.writeFileSync(`${output}/${key}-source.png`,source);fs.writeFileSync(`${output}/${key}-target.png`,target);const repeat=compare(source,sourceRepeat,`${key}-repeat`)+compare(target,targetRepeat,`${key}-target-repeat`);const changedPixels=compare(source,target,key);report.samples.push({id:key,clip,changedPixels,repeatabilityPixels:repeat,sourceSha256:sha256(source),targetSha256:sha256(target)});console.log(`${key}: ${changedPixels} pixels, repeat ${repeat}`);}
 await a.context.close();await b.context.close();
 }
 report.immutableAfter=hashes();assert.deepEqual(before,report.immutableAfter);checkSource();report.status=report.samples.some(s=>s.changedPixels||s.repeatabilityPixels)?'failed':'passed';fs.writeFileSync(`${evidence}/${process.argv[2]==='audit'?'audit':'visual-verification'}.json`,JSON.stringify(report,null,2)+'\n');if(report.status==='failed')assert.fail('Shell crop raster gate failed; complete audit retained');
}catch(error){report.status='failed';report.error=String(error.stack);fs.writeFileSync(`${output}/failed-visual.json`,JSON.stringify(report,null,2)+'\n');throw error;}
finally{await browser?.close();if(server.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await exited;}await stopSource();}
