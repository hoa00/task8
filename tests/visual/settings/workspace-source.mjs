import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage } from '../reference/environment.mjs';
import { ready } from '../tasks/verify.mjs';
const attempt=process.argv.find(arg=>arg.startsWith('--attempt='))?.slice(10),out=`docs/poc/evidence/WU-24/attempts/${attempt}`;
if(!attempt||fs.existsSync(out))throw Error('Unique source inspection attempt required');fs.mkdirSync(out,{recursive:true});fs.copyFileSync('tests/visual/settings/workspace-source.mjs',`${out}/executed-harness.mjs`);
const stop=await sourceServer();let browser;
try{browser=await chromium.launch({headless:true,args:['--disable-partial-raster']});for(const width of [1440,390]){const session=await newPage(browser,{viewport:{width,height:width===1440?1000:844},mobile:width===390},undefined,true,'http://127.0.0.1:4173');await session.page.goto('http://127.0.0.1:4173');for(const section of ['members','teams','projects','permissions','notif-email','notif-push','notif-mentions','notif-assign']){await session.page.evaluate(async section=>{const{go}=await import('/src/shell/render.js');go('settings',{sec:section});},section);await ready(session.page);await session.page.screenshot({path:`${out}/${section}-${width}-source.png`});}await session.context.close();}fs.writeFileSync(`${out}/report.json`,JSON.stringify({status:'passed',scope:'Fresh Source inspection only; no parity claim',pngCount:16},null,2)+'\n');}finally{await browser?.close();await stop();}
