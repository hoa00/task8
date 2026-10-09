import fs from 'node:fs';
import {chromium} from '@playwright/test';
import {sourceIdentities} from '../../../packages/contracts/src/source-identities.ts';
import {sourceServer} from '../reference/source-server.mjs';
import {newPage} from '../reference/environment.mjs';
import {readJson,artifacts} from '../reference/source-check.mjs';
import {ready,targetServer} from '../tasks/verify.mjs';
import {sourceTable} from './source-sample.mjs';
const stopS=await sourceServer(),stopT=await targetServer(),browser=await chromium.launch({headless:true});
try {const a=await newPage(browser,{},readJson(`${artifacts}/source-fixture.json`)),b=await newPage(browser,{},undefined,true,'http://127.0.0.1:5173');await a.page.goto('http://127.0.0.1:4173');await sourceTable(a.page,{scope:'workspace',state:'default'},sourceIdentities);await b.page.goto('http://127.0.0.1:5173/task-table.html?visual=1');await b.page.waitForSelector('[data-table-task]');for(const page of [a.page,b.page])await ready(page);const diagnostics=[];for(const [page,selector]of[[a.page,'#source-table .lbl'],[b.page,'.task-table td .inline-flex.h-5']])diagnostics.push(await page.evaluate(selector=>{const el=document.querySelector(selector);return[el,el.parentElement,el.parentElement.parentElement].map(el=>({html:el.outerHTML,rect:el.getBoundingClientRect().toJSON(),css:Object.fromEntries([...getComputedStyle(el)].filter(key=>!key.startsWith('--')).map(key=>[key,getComputedStyle(el).getPropertyValue(key)]))}));},selector));const differences=Object.fromEntries(Object.entries(diagnostics[0][0].css).filter(([key,value])=>value!==diagnostics[1][0].css[key]).map(([key,value])=>[key,[value,diagnostics[1][0].css[key]]]));fs.writeFileSync('docs/poc/evidence/WU-13/label-diagnostic.json',JSON.stringify({diagnostics,differences},null,2)+'\n');console.log(JSON.stringify({rects:diagnostics.map(x=>x.map(el=>el.rect)),differences}));}finally {await browser.close();await stopT();await stopS();}
