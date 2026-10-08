import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { newPage, environment } from '../reference/environment.mjs';
const child=spawn(process.execPath,['./node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort'],{cwd:path.resolve('apps/web'),stdio:'pipe'});let logs='';child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);let browser;
const report={mode:'development-actual-StrictMode',environment,probes:[]};
try{
  for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:5173/overlays.html')).ok)break;}catch{/* startup */}if(child.exitCode!==null)throw new Error(logs);await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({headless:true});const {page,context}=await newPage(browser,{},undefined,true,'http://127.0.0.1:5173');
  await context.addInitScript(()=>{
    const tracked=['keydown','pointerdown','focusin','scroll','animationend','transitionend'];const active=new Map(tracked.map(type=>[type,new Set()]));const added=Object.fromEntries(tracked.map(type=>[type,0]));const removed=Object.fromEntries(tracked.map(type=>[type,0]));const add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document);
    document.addEventListener=(type,listener,options)=>{if(active.has(type)){active.get(type).add(listener);added[type]++;}return add(type,listener,options);};
    document.removeEventListener=(type,listener,options)=>{if(active.has(type)){active.get(type).delete(listener);removed[type]++;}return remove(type,listener,options);};
    window.overlayListenerEvidence=()=>({active:Object.fromEntries([...active].map(([type,listeners])=>[type,listeners.size])),added,removed});
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173/overlays.html?case=modal&open=1&popup=1');await expect(page.getByRole('menu')).toBeVisible();
  const mounted=await page.evaluate(()=>window.overlayListenerEvidence());assert.deepEqual(mounted.active,{keydown:1,pointerdown:1,focusin:1,scroll:1,animationend:1,transitionend:1});assert.ok(mounted.added.keydown>=2&&mounted.removed.keydown>=1,'StrictMode effect replay happened');await expect(page.getByRole('menuitemradio',{name:'Favorite'})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(1);report.probes.push({id:'strictmode-effect-replay-single-active-listeners',pass:true,mounted});
  await page.locator('#toggle-provider').evaluate(el=>el.click());await expect(page.getByRole('dialog')).toHaveCount(0);const unmounted=await page.evaluate(()=>window.overlayListenerEvidence());assert.deepEqual(unmounted.active,{keydown:0,pointerdown:0,focusin:0,scroll:0,animationend:0,transitionend:0});assert.equal(await page.evaluate(()=>document.body.style.overflow),'');report.probes.push({id:'provider-unmount-cleans-listeners-lock',pass:true,unmounted});
  await page.locator('#toggle-provider').evaluate(el=>el.click());await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);const remounted=await page.evaluate(()=>window.overlayListenerEvidence());assert.deepEqual(remounted.active,{keydown:1,pointerdown:1,focusin:1,scroll:0,animationend:0,transitionend:0});report.probes.push({id:'provider-remount-one-dismiss-per-key',pass:true,remounted});assert.deepEqual(errors,[]);report.pageErrors=errors;report.status='passed';fs.writeFileSync('docs/poc/evidence/WU-05/lifecycle.json',JSON.stringify(report,null,2)+'\n');await context.close();console.log(JSON.stringify({status:'passed',probes:report.probes.length}));
}finally{await browser?.close();if(child.exitCode===null){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exit;}}
