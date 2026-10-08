import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, checkSource, readJson, reference, sha256 } from '../reference/source-check.mjs';
import { sourceSample, sourcePreferences } from './source-sample.mjs';
const evidence = path.resolve('docs/poc/evidence/WU-03');
const output = path.resolve('test-results/WU-03');
fs.mkdirSync(output, { recursive: true });
const fonts = readJson(`${artifacts}/font-assets.json`);
const immutable = ['baseline-manifest.json', 'font-assets.json', 'source-fixture.json', 'source-lock.json'];
const before = Object.fromEntries(immutable.map(name => [name, sha256(fs.readFileSync(`${artifacts}/${name}`))]));
checkSource();
const tokenNames = [...new Set([...fs.readFileSync(`${reference}/src/styles/tokens.css`, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/g)].map(match => match[1]))].concat('--reduce');
const stopSource = await sourceServer();
const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: path.resolve('apps/web'), stdio: 'pipe' });
let serverOutput = '';
child.stdout.on('data', value => { serverOutput += value; });
child.stderr.on('data', value => { serverOutput += value; });
const stopTarget = async () => { if (child.exitCode !== null) return; const exit = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM'); await exit; };
let browser;
const report = { sourceSha: '904205c626918ee96054eb35495c394a60c0c601', runtime: { node: process.version, os: os.platform(), release: os.release(), arch: os.arch(), executablePath: chromium.executablePath(), ...environment }, samples: [], probes: [], fontRequests: [], limitations: ['Linux source-only foundation samples; no claim of parity with the official Darwin whole-page baseline.'], immutableBefore: before };
async function fontReady(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    for (const spec of ['400 13.5px Geist', '450 13.5px Geist', '500 13.5px Geist', '600 13.5px Geist', '400 13.5px "Geist Mono"']) {
      const loaded = await document.fonts.load(spec, 'Gr8r Studio 123 Ж Ѣ Ḁ Tiếng Việt ─');
      if (!loaded.length || loaded.some(face => face.status !== 'loaded')) throw new Error(`Font fallback: ${spec}`);
    }
    return [...document.fonts].map(face => ({ family: face.family, weight: face.weight, style: face.style, status: face.status, unicodeRange: face.unicodeRange }));
  });
}
async function measure(page) {
  return page.evaluate(tokenNames => {
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const properties = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'borderTopColor', 'borderTopWidth', 'borderTopStyle', 'borderRadius', 'padding', 'boxShadow', 'display', 'fontFeatureSettings', 'fontVariantNumeric'];
    const tokenValues = Object.fromEntries(tokenNames.map(name => [name, root.getPropertyValue(name).trim()]));
    const probe = document.createElement('div'); document.body.append(probe);
    const resolvedTokens = Object.fromEntries(tokenNames.map(name => {
      const property = name === '--font' || name === '--mono' ? 'fontFamily' : name.startsWith('--shadow-') ? 'boxShadow' : name === '--dur' ? 'transitionDuration' : ['--ease','--spring','--ease-drawer'].includes(name) ? 'transitionTimingFunction' : name.startsWith('--fs') ? 'fontSize' : name.startsWith('--r') && name !== '--row-h' && name !== '--reduce' ? 'borderRadius' : /^(--s-|--h-|--side-|--row-h|--card-pad|--topbar-h|--gutter)/.test(name) ? 'width' : name === '--pc-mix' || name === '--reduce' ? null : 'color';
      if (!property) return [name, tokenValues[name]];
      probe.style.cssText = ''; probe.style[property] = `var(${name})`;
      return [name, tokenValues[name] ? getComputedStyle(probe)[property] : ''];
    })); probe.remove();
    return {
      tokens: Object.fromEntries(tokenNames.map(name => [name, root.getPropertyValue(name).trim()])),
      resolvedTokens,
      base: Object.fromEntries(['fontFamily', 'fontSize', 'lineHeight', 'color', 'backgroundColor', 'overflow', 'fontFeatureSettings'].map(key => [key, body[key]])),
      attributes: Object.fromEntries(['theme', 'accent', 'side', 'density', 'motion'].map(key => [key, document.documentElement.getAttribute(`data-${key}`)])),
      samples: [...document.querySelectorAll('#foundation-sample [data-type],#foundation-sample [data-weight],#foundation-sample [data-mono],#foundation-sample [data-row],#foundation-sample [data-swatch],#foundation-sample [data-shadow],#foundation-sample [data-hover],#foundation-sample [data-wide],#foundation-sample [data-tablet],#foundation-sample [data-mobile]')].map(el => {
        const style = getComputedStyle(el), rect = el.getBoundingClientRect();
        return { key: Object.entries(el.dataset).map(([k,v])=>`${k}:${v}`).join('|'), geometry: [rect.x,rect.y,rect.width,rect.height], style: Object.fromEntries(properties.map(key => [key,style[key]])) };
      }),
      icons: [...document.querySelectorAll('#foundation-sample svg')].map(el => ({ attributes: Object.fromEntries(['width','height','viewBox','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','aria-hidden','role','aria-label'].map(key=>[key,el.getAttribute(key)])), children: [...el.children].map(node=>({ tag:node.tagName, attributes:Object.fromEntries([...node.attributes].map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b))) })) })),
    };
  }, tokenNames);
}
function assertMeasurements(target, source, label) {
  // CSS minification may serialize quotes/numbers differently; compare CSSOM values.
  // Tailwind shadow utilities prepend four transparent 0px ring layers with no pixels.
  const normalized = value => ({ ...value, tokens: undefined, samples: value.samples.map(sample => ({ ...sample, style: { ...sample.style, boxShadow: sample.style.boxShadow.replaceAll('rgba(0, 0, 0, 0) 0px 0px 0px 0px, ', '') } })) });
  assert.deepEqual(normalized(target), normalized(source), label);
}
async function settled(page) { await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(()=>{}))); }); }
function compareImages(a,b,label) {
  const left=PNG.sync.read(a),right=PNG.sync.read(b);
  assert.equal(left.width,right.width);assert.equal(left.height,right.height);
  const diff=new PNG({width:left.width,height:left.height});
  const changed=pixelmatch(left.data,right.data,diff.data,left.width,left.height,{threshold:0,includeAA:true});
  if(changed)fs.writeFileSync(`${output}/${label}-diff.png`,PNG.sync.write(diff));
  assert.equal(changed,0,`${label}: ${changed} differing pixels`);
  return changed;
}
try {
  for(let attempt=0;attempt<40;attempt++){try { const response=await fetch('http://127.0.0.1:5173/foundation.html'); if(response.ok)break; } catch { /* Preview starts asynchronously. */ } if(child.exitCode!==null)throw new Error(serverOutput);await new Promise(resolve=>setTimeout(resolve,100)); }
  browser=await chromium.launch({headless:true});report.runtime.browser=browser.version();
  const source=await newPage(browser);const target=await newPage(browser,{},undefined,true,'http://127.0.0.1:5173');
  const errors=[];source.page.on('pageerror',error=>errors.push(`source: ${error.message}`));target.page.on('pageerror',error=>errors.push(`target: ${error.message}`));
  target.page.on('response',async response=>{if(response.url().endsWith('.woff2')){const bytes=await response.body();report.fontRequests.push({url:response.url(),status:response.status(),sha256:sha256(bytes)});}});
  await source.page.goto('http://127.0.0.1:4173');await sourceSample(source.page);
  await target.page.goto('http://127.0.0.1:5173/foundation.html');
  report.sourceFonts=await fontReady(source.page);report.targetFonts=await fontReady(target.page);
  assert.deepEqual(report.targetFonts,report.sourceFonts);
  assert.equal(report.targetFonts.length,21);
  report.fontMatching = {};
  for (const [name, page] of [['source', source.page], ['target', target.page]]) {
    const metrics = await page.evaluate(() => {
      const widths = Object.fromEntries([400,450,500,600].map(weight => {
        const span = document.createElement('span');span.textContent='Workspace navigation Gr8r 012345';span.style.cssText=`font-weight:${weight};position:fixed;left:900px;top:900px`;
        document.body.append(span);const width=span.getBoundingClientRect().width;span.remove();return [weight,width];
      }));return {widths,faces:[...document.fonts].filter(face=>face.family==='Geist').map(face=>face.weight)};
    });
    const cdp = await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const doc=await cdp.send('DOM.getDocument');
    const platformFonts=[];
    for (const selector of ['[data-weight="450"]','[data-mono]']) { const node=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});const result=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId});assert.ok(result.fonts.length>0);assert.ok(result.fonts.every(font=>font.isCustomFont));platformFonts.push({selector,fonts:result.fonts}); }
    await cdp.detach();report.fontMatching[name]={...metrics,platformFonts};
  }
  assert.deepEqual(report.fontMatching.target,report.fontMatching.source);
  assert.equal(report.fontMatching.source.widths[450],report.fontMatching.source.widths[500]);
  assert.ok(!report.fontMatching.source.faces.includes('450'));
  const setTarget=async values=>{for(const [key,value] of Object.entries(values))await target.page.getByLabel(key,{exact:true}).selectOption(value);};
  for(const theme of ['light','dark'])for(const accent of ['indigo','blue','violet','teal','rose','graphite'])for(const density of ['comfortable','compact']) {
    const prefs={theme,accent,density,side:density,motion:'system'};const id=`${theme}-${accent}-${density}`;
    await sourcePreferences(source.page,prefs);await setTarget(prefs);await settled(source.page);await settled(target.page);
    const sourceValues=await measure(source.page),targetValues=await measure(target.page);
    fs.writeFileSync(`${output}/${id}-computed.json`,JSON.stringify({source:sourceValues,target:targetValues},null,2)+'\n');
    assertMeasurements(targetValues,sourceValues,`${id} computed parity`);
    const referenceImage=await source.page.locator('#foundation-sample').screenshot({animations:'allow'});
    const repeat=await source.page.locator('#foundation-sample').screenshot({animations:'allow'});
    fs.writeFileSync(`${output}/${id}-source.png`,referenceImage);
    compareImages(referenceImage,repeat,`${id}-source-repeat`);
    const targetImage=await target.page.locator('#foundation-sample').screenshot({animations:'allow'});
    fs.writeFileSync(`${output}/${id}-target.png`,targetImage);
    compareImages(referenceImage,targetImage,id);
    report.samples.push({id,sourceSha256:sha256(referenceImage),targetSha256:sha256(targetImage),repeatabilityPixels:0,changedPixels:0,tokenCount:tokenNames.length,iconCount:sourceValues.icons.length});
  }
  for(const width of [1099,1100,1101,899,900,901,639,640,641]) {
    await source.page.setViewportSize({width,height:1000});await target.page.setViewportSize({width,height:1000});
    const a=await measure(source.page),b=await measure(target.page);assertMeasurements(b,a,`boundary ${width}`);
    report.probes.push({id:`boundary-${width}`,gutter:b.tokens['--gutter'],topbar:b.tokens['--topbar-h'],displays:b.samples.filter(item=>/^(wide|tablet|mobile):/.test(item.key)).map(item=>[item.key,item.style.display]),pass:true});
  }
  await source.page.setViewportSize({width:1440,height:1000});await target.page.setViewportSize({width:1440,height:1000});
  for(const theme of ['system','light','dark'])for(const colorScheme of ['light','dark']) {
    await source.page.emulateMedia({colorScheme});await target.page.emulateMedia({colorScheme});await sourcePreferences(source.page,{theme});await setTarget({theme});
    assertMeasurements(await measure(target.page),await measure(source.page));
    assert.equal(await target.page.locator('[data-effective-dark]').textContent(),String(theme==='dark'||(theme==='system'&&colorScheme==='dark')));
    report.probes.push({id:`theme-${theme}-os-${colorScheme}`,pass:true});
  }
  for(const motion of ['system','full','reduce'])for(const reducedMotion of ['no-preference','reduce']) {
    await source.page.emulateMedia({reducedMotion});await target.page.emulateMedia({reducedMotion});await sourcePreferences(source.page,{motion});await setTarget({motion});
    const a=await source.page.locator('#foundation-sample [data-motion]').evaluate(el=>{const s=getComputedStyle(el);return {name:s.animationName,duration:s.animationDuration,reduce:getComputedStyle(document.documentElement).getPropertyValue('--reduce').trim()};});
    const b=await target.page.locator('#foundation-sample [data-motion]').evaluate(el=>{const s=getComputedStyle(el);return {name:s.animationName,duration:s.animationDuration,reduce:getComputedStyle(document.documentElement).getPropertyValue('--reduce').trim()};});
    assert.deepEqual(b,a);report.probes.push({id:`motion-${motion}-os-${reducedMotion}`,...b,pass:true});
  }
  await source.page.emulateMedia({reducedMotion:'no-preference'});await target.page.emulateMedia({reducedMotion:'no-preference'});
  await source.page.locator('[data-hover]').hover();await target.page.locator('[data-hover]').hover();
  assertMeasurements(await measure(target.page),await measure(source.page));report.probes.push({id:'hover-without-media-guard',pass:true});
  await source.page.keyboard.press('Tab');await target.page.keyboard.press('Tab');
  const focus=page=>page.locator('[data-hover]').evaluate(el=>{el.focus();const s=getComputedStyle(el);return [s.outline,s.outlineOffset,s.borderRadius];});
  assert.deepEqual(await focus(target.page),await focus(source.page));report.probes.push({id:'focus-visible',pass:true});
  const saved=await target.page.evaluate(()=>localStorage.getItem('task8.ui.theme.v1'));await target.page.reload();await fontReady(target.page);assert.equal(await target.page.evaluate(()=>localStorage.getItem('task8.ui.theme.v1')),saved);report.probes.push({id:'preference-reload',pass:true});
  await target.page.evaluate(()=>localStorage.setItem('task8.ui.theme.v1','{"theme":"invalid","accent":"invalid","side":"invalid","density":"invalid","motion":"invalid"}'));await target.page.reload();await fontReady(target.page);
  assert.deepEqual(await target.page.evaluate(()=>JSON.parse(localStorage.getItem('task8.ui.theme.v1'))),{theme:'system',accent:'indigo',side:'comfortable',density:'comfortable',motion:'system'});report.probes.push({id:'invalid-preference-defaults',pass:true});
  await source.context.close();await target.context.close();
  const touchSource=await newPage(browser,{mobile:true});const touchTarget=await newPage(browser,{mobile:true},undefined,true,'http://127.0.0.1:5173');
  await touchSource.page.goto('http://127.0.0.1:4173');await sourceSample(touchSource.page);await touchTarget.page.goto('http://127.0.0.1:5173/foundation.html');await fontReady(touchSource.page);await fontReady(touchTarget.page);
  const touchHover=async page=>{assert.equal(await page.evaluate(()=>matchMedia('(hover:hover)').matches),false);await page.locator('[data-hover]').hover();return page.locator('[data-hover]').evaluate(el=>{const style=getComputedStyle(el);return [style.backgroundColor,style.color,el.matches(':hover')];});};
  const touchA=await touchHover(touchSource.page),touchB=await touchHover(touchTarget.page);assert.deepEqual(touchB,touchA);assert.equal(touchB[2],true);report.probes.push({id:'touch-hover-without-media-guard',pass:true});await touchSource.context.close();await touchTarget.context.close();
  // Missing fonts must fail readiness rather than accept system fallback.
  const negative=await newPage(browser,{},undefined,true,'http://127.0.0.1:5173');await negative.context.route('**/*.woff2',route=>route.abort());await negative.page.goto('http://127.0.0.1:5173/foundation.html');await assert.rejects(fontReady(negative.page));await negative.context.close();report.probes.push({id:'missing-font-negative',pass:true});
  await new Promise(resolve=>setTimeout(resolve,50));
  for(const request of report.fontRequests){assert.equal(request.status,200);assert.ok(fonts.assets.some(asset=>asset.sha256===request.sha256),`Unlocked font ${request.url}`);}
  assert.equal(new Set(report.fontRequests.map(item=>item.sha256)).size,11,'All font subsets requested with locked bytes');
  assert.deepEqual(errors,[]);
  report.immutableAfter=Object.fromEntries(immutable.map(name=>[name,sha256(fs.readFileSync(`${artifacts}/${name}`))]));assert.deepEqual(report.immutableAfter,before);checkSource();
  report.status='passed';report.threshold=0;report.maxDiffPixels=0;report.includeAA=true;report.mask=[];
  fs.writeFileSync(`${evidence}/verification.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,samples:report.samples.length,probes:report.probes.length,fonts:11,iconCount:report.samples[0].iconCount}));
} catch(error) { report.status='failed';report.error=String(error.stack);fs.writeFileSync(`${output}/failed-verification.json`,JSON.stringify(report,null,2)+'\n');throw error; }
finally { await browser?.close();await stopTarget();await stopSource(); }
