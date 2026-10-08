import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { sourcePreferences } from '../foundation/source-sample.mjs';
import { sourceOverlays } from './source-sample.mjs';
const base='docs/poc/evidence/WU-05/motion';fs.mkdirSync(base,{recursive:true});const stop=await sourceServer();
const child=spawn(process.execPath,['./node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5173','--strictPort'],{cwd:path.resolve('apps/web'),stdio:'pipe'});let logs='';child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);let browser;
const report={environment,control:'Web Animations API pause/currentTime only on the selected original overlay CSS animations; unrelated input focus transitions settle concurrently; no stylesheet/keyframe changes',cases:[]};
try{
  for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:5173/overlays.html')).ok)break;}catch{/* starting */}if(child.exitCode!==null)throw new Error(logs);await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({headless:true});
  for(const scenario of ['modal','menu','drawer','toast'])for(const motion of ['full','system','reduce']){
    const a=await newPage(browser),b=await newPage(browser,{},undefined,true,'http://127.0.0.1:5173');const id=`${scenario}-${motion}`;
    await b.context.addInitScript(prefs=>localStorage.setItem('task8.ui.theme.v1',JSON.stringify(prefs)),{theme:'light',accent:'indigo',side:'comfortable',density:'comfortable',motion});
    await a.page.goto('http://127.0.0.1:4173');await sourcePreferences(a.page,{theme:'light',accent:'indigo',motion});await sourceOverlays(a.page,scenario,false,true);await b.page.goto('http://127.0.0.1:5173/overlays.html');await b.page.getByLabel('Case').selectOption(scenario);await b.page.getByRole('button',{name:'Open overlay'}).click();
    const sourceSelector=scenario==='menu'?'.pop':scenario==='modal'?'.modal':scenario==='drawer'?'.drawer':'.toast';const targetSelector=scenario==='menu'?'.ui-popover':scenario==='modal'?'.ui-dialog':scenario==='drawer'?'.ui-drawer':'.ui-toast';
    const inspect=(page,selector)=>page.locator(selector).evaluate(el=>{const animation=el.getAnimations().find(a=>a.effect?.target===el);if(!animation)throw new Error('Missing opening animation');animation.pause();animation.currentTime=0;const css=getComputedStyle(el);return {duration:Number(animation.effect.getTiming().duration),easing:css.animationTimingFunction,name:css.animationName};});
    const source=await inspect(a.page,sourceSelector),target=await inspect(b.page,targetSelector);assert.equal(target.duration,source.duration);assert.equal(target.easing,source.easing);assert.equal(source.duration,motion==='reduce'?120:scenario==='modal'?260:scenario==='menu'?160:scenario==='drawer'?340:200);
    await b.page.locator('#overlay-qa').evaluate(el=>el.style.visibility='hidden');const frames=[];
    for(const phase of [0,.5,.99]){
      const computed=[];for(const [page,selector,owner] of [[a.page,sourceSelector,'source'],[b.page,targetSelector,'target']]){
        await page.mouse.move(1400,900);if(scenario==='modal'||scenario==='drawer')await page.getByRole('textbox',{name:'Draft'}).focus();if(scenario==='menu'){await page.locator(`${selector} [aria-checked=true]`).focus();await page.keyboard.press('ArrowRight');}await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))));computed.push(await page.locator(selector).evaluate((el,phase)=>{const animation=el.getAnimations().find(a=>a.effect?.target===el);animation.currentTime=Number(animation.effect.getTiming().duration)*phase;const css=getComputedStyle(el);return {opacity:css.opacity,transform:css.transform};},phase));
        const file=`${id}-${phase}-${owner}.png`;fs.writeFileSync(`${base}/${file}`,await page.screenshot({animations:'allow',caret:'hide'}));
      }
      assert.deepEqual(computed[1],computed[0]);frames.push({phase,source:`${id}-${phase}-source.png`,target:`${id}-${phase}-target.png`,computed:computed[0]});
    }
    report.cases.push({id,source,target,frames});await a.context.close();await b.context.close();
  }
  report.buttonActive=[];
  for(const motion of ['full','reduce']){
    const a=await newPage(browser),b=await newPage(browser,{},undefined,true,'http://127.0.0.1:5173');
    await b.context.addInitScript(prefs=>localStorage.setItem('task8.ui.theme.v1',JSON.stringify(prefs)),{theme:'light',accent:'indigo',side:'comfortable',density:'comfortable',motion});
    await a.page.goto('http://127.0.0.1:4173');await sourcePreferences(a.page,{theme:'light',accent:'indigo',motion});await sourceOverlays(a.page,'button');await b.page.goto('http://127.0.0.1:5173/overlays.html');
    const states=[];
    for(const page of [a.page,b.page]){
      const button=page.getByRole('button',{name:'Open overlay',exact:true});const rect=await button.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
      states.push(await button.evaluate((el,motion)=>{const css=getComputedStyle(el);const transition=el.getAnimations().find(a=>a.transitionProperty==='transform');if(motion==='full'){if(!transition)throw new Error('Missing transform CSS transition');transition.pause();transition.currentTime=70;}return {scale:css.scale,transform:css.transform,duration:transition?.effect.getTiming().duration??null,easing:transition?.effect.getTiming().easing??null};},motion));
    }
    assert.deepEqual(states[1],states[0]);assert.equal(states[0].scale,'none');if(motion==='full')assert.equal(states[0].duration,140);else assert.equal(states[0].transform,'none');report.buttonActive.push({motion,source:states[0],target:states[1]});
    for(const page of [a.page,b.page])await page.mouse.up();await a.context.close();await b.context.close();
  }
  report.status='passed';fs.writeFileSync('docs/poc/evidence/WU-05/motion.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'passed',cases:report.cases.length,frames:report.cases.length*3}));
}finally{await browser?.close();if(child.exitCode===null){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exit;}await stop();}
