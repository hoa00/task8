import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { sourceIdentities } from '../../../packages/contracts/src/source-identities.ts';
import { artifacts, readJson, checkSource } from '../reference/source-check.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { sourceServer } from '../reference/source-server.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { sourceCalendar } from './source-sample.mjs';
const evidence='docs/poc/evidence/WU-14',report={runtime:environment,scope:'MyTasks feature390, original source due-sorted fixture symmetric with target; native mouse gesture in mobile browser context, no physical phone claim',observations:[]};
const stopSource=await sourceServer(),stopTarget=await targetServer();let browser;
try {
 browser=await chromium.launch({headless:true});report.browser=browser.version();const a=await newPage(browser,{viewport:{width:390,height:844},mobile:true},readJson(`${artifacts}/source-fixture.json`)),b=await newPage(browser,{viewport:{width:390,height:844},mobile:true},undefined,true,'http://127.0.0.1:5173');
 await a.page.goto('http://127.0.0.1:4173');await a.page.waitForFunction(()=>window.__gr8r);await a.page.evaluate(async()=>{const{S}=await import('/src/core/store.js');S.ui.route='mytasks';S.ui.params={};});const setup=await sourceCalendar(a.page,{scope:'mine',mode:'month',state:'default'},sourceIdentities);report.sourceSetup=setup;
 await b.page.goto(`http://127.0.0.1:5173/calendar.html?visual=1&scope=mine&view=${encodeURIComponent(JSON.stringify({query:{sortField:'due'},groupBy:'none'}))}`);await b.page.waitForSelector('[data-calendar-coverage=complete]');
 for(const[side,page,selector]of[['source',a.page,'#source-calendar [data-k=calMode][data-v=week]'],['target',b.page,'[role=radio]']]) {
  await ready(page);const button=side==='source'?page.locator(selector):page.getByRole('radio',{name:'Week',exact:true});const geometry=await button.evaluate(button=>{const rect=button.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return{rect:rect.toJSON(),hit:hit?.outerHTML,hitButton:hit===button||button.contains(hit)};});await page.evaluate(()=>{window.__mobilePointer=[];document.addEventListener('click',event=>window.__mobilePointer.push({trusted:event.isTrusted,target:event.target.outerHTML}),{capture:true});});await page.mouse.click(geometry.rect.x+geometry.rect.width/2,geometry.rect.y+geometry.rect.height/2);
  const mode=side==='source'?await page.evaluate(async()=>(await import('/src/core/store.js')).S.ui.calMode):await page.locator('[data-calendar-mode]').getAttribute('data-calendar-mode');const events=await page.evaluate(()=>window.__mobilePointer);assert.ok(events.some(event=>event.trusted));await page.screenshot({path:`${evidence}/diagnostics/${side}-mine390-mode-pointer.png`});
  let shifts=0;while(shifts++<80&&!await page.evaluate(side=>side==='source'?document.activeElement?.matches('[data-k=calMode][data-v=week]'):document.activeElement?.getAttribute('role')==='radio'&&document.activeElement?.textContent==='Month',side))await page.keyboard.press('Shift+Tab');assert.ok(shifts<=80);await page.keyboard.press(side==='source'?'Space':'ArrowRight');
  if(side==='source'){await page.waitForFunction(async()=>(await import('/src/core/store.js')).S.ui.calMode==='week');await page.waitForSelector('#app .week',{state:'attached'});await sourceCalendar(page,{scope:'mine',mode:'week',state:'default'},sourceIdentities);await page.waitForSelector('#source-calendar .week');}else await page.waitForSelector('[data-calendar-mode=week]');
  await page.screenshot({path:`${evidence}/diagnostics/${side}-mine390-native-keyboard-week.png`});report.observations.push({side,sourceRendererTransition:side==='source'?'Native action mounts #app .week, then original feature fixture recomposed; no external section rerender claim':undefined,geometry,trustedMouseEvents:events,modeAfterPointer:mode,pointerOpenedWeek:mode==='week',nativeKeyboardShifts:shifts-1,keyboardWeek:true,limitation:mode==='week'?'Pointer center works in this source-matching context.':'Mode center is covered by weekday head; pointer leaves Month. Native keyboard remains available; source geometry retained.'});
 }
 checkSource();report.status='observed';fs.writeFileSync(`${evidence}/mobile-pointer-observation.json`,JSON.stringify(report,null,2)+'\n');
}finally{await browser?.close();await stopTarget();await stopSource();}
