import fs from 'node:fs';
import {chromium} from '@playwright/test';
import {sourceServer} from '../reference/source-server.mjs';
import {targetServer,ready} from '../tasks/verify.mjs';
import {newPage} from '../reference/environment.mjs';
import {readJson,artifacts} from '../reference/source-check.mjs';
import {sourcePreferences} from '../foundation/source-sample.mjs';
import {sourceIdentities} from '../../../packages/contracts/src/source-identities.ts';
const stopa=await sourceServer(),stopb=await targetServer(),out={};let browser;
const sid=(c,s)=>sourceIdentities.find(x=>x.collection===c&&x.sourceId===s).id;
try {
 browser=await chromium.launch();
 const a=await newPage(browser,{viewport:{width:390,height:844},mobile:true},readJson(`${artifacts}/source-fixture.json`)),b=await newPage(browser,{viewport:{width:390,height:844},mobile:true},undefined,true,'http://127.0.0.1:5173');
 await a.page.goto('http://127.0.0.1:4173');await sourcePreferences(a.page,{theme:'light',accent:'indigo',motion:'system'});await a.page.evaluate(()=>window.__gr8r.go('project',{id:'p1',tab:'list'}));
 await b.page.goto(`http://127.0.0.1:5173/project-routes.html?${new URLSearchParams({path:`/w/${sid('workspaces','w1')}/projects/${sid('projects','p1')}/list`})}`);await b.page.waitForSelector('[data-project-host]');
 for(const[p,sel,side]of[[a.page,'.proj-h .tabs','source'],[b.page,'.project-header-tabs','target']]){await ready(p);await p.evaluate(sel=>{window.__scrollEvents=[];document.addEventListener('scroll',event=>{if(event.target.matches?.(sel))window.__scrollEvents.push({t:performance.now(),left:event.target.scrollLeft,path:location.pathname});},true);},sel);out[side]={initial:await p.locator(sel).evaluate(el=>({left:el.scrollLeft,width:el.scrollWidth}))};await p.getByRole('button',{name:'Save view',exact:true}).click();out[side].opened=await p.locator(sel).evaluate(el=>el.scrollLeft);}
 await a.page.locator('#sv-name').fill('Native scroll');await a.page.locator('[data-a=saveViewSubmit]').click();await b.page.getByLabel('View name',{exact:true}).fill('Native scroll');await b.page.getByRole('dialog').getByRole('button',{name:'Save view',exact:true}).click();await b.page.waitForURL('**/views/**');
 for(const[p,sel,side]of[[a.page,'.proj-h .tabs','source'],[b.page,'.project-header-tabs','target']]){await ready(p);out[side].saved=await p.locator(sel).evaluate(el=>({left:el.scrollLeft,width:el.scrollWidth,active:document.activeElement?.outerHTML}));out[side].events=await p.evaluate(()=>window.__scrollEvents);}
 await a.page.locator('.content').getByRole('button',{name:'Members',exact:true}).click();await b.page.getByRole('button',{name:'Members',exact:true}).click();
 for(const[p,side,sel]of[[a.page,'source','.modal,.modal h2,.modal b,.modal .sel-trigger,.modal .btn'],[b.page,'target','[role=dialog],[role=dialog] h2,[role=dialog] b,[role=dialog] button,[role=dialog] strong']]){await ready(p);out[side].modal=await p.evaluate(sel=>[...document.querySelectorAll(sel)].map(el=>({text:el.textContent,rect:el.getBoundingClientRect().toJSON(),css:Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','transform','animationName','animationFillMode','zoom','textSizeAdjust','position','opacity','color'].map(k=>[k,getComputedStyle(el)[k]]))})),sel);}
 fs.writeFileSync('docs/poc/evidence/WU-16/diagnostics/mobile-scroll-and-modal.json',JSON.stringify(out,null,2)+'\n');
}finally{await browser?.close();await stopb();await stopa();}
