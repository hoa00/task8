import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { newPage, environment } from '../reference/environment.mjs';
import { sourceServer } from '../reference/source-server.mjs';
import { readJson, artifacts, sha256 } from '../reference/source-check.mjs';
import { createSeedDataset } from '../../../apps/web/src/data/mock/seed.ts';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';
import { targetServer, ready } from '../tasks/verify.mjs';
const attempt = process.argv[2], output = `docs/poc/evidence/WU-26/attempts/${attempt}`;
if (!attempt || fs.existsSync(output)) throw Error('Unique attempt required'); fs.mkdirSync(output, { recursive: true }); fs.copyFileSync(import.meta.filename, `${output}/executed-harness.mjs`);
const assets = () => ({ ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() });
const report = { status: 'running', runtime: { node: process.version, ...environment }, probes: [], assetsBefore: assets(), immutableBefore: immutableInputs(), scope: 'Actual first Auth route appearance animation CSS, delays, easing and keyframes. Stored and OS reduced motion. Initial fixture snapshots and actual font response bytes; no Source second render before timing measurement, no pixel-motion/platform/default-raster claim.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const write = (name, bytes) => { const file = `${output}/${name}`; fs.writeFileSync(file, bytes, { flag: 'wx' }); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
const stopSource = await sourceServer(), stopTarget = await targetServer(); let browser;
try { browser = await chromium.launch({ args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version();
  for (const mode of ['normal', 'stored-reduce', 'os-reduce']) {
    const reduced = mode !== 'normal';
    const pair = [];
    for (const side of ['source', 'target']) {
      const fixture = readJson(`${artifacts}/source-fixture.json`); fixture.prefs.motion = mode === 'stored-reduce' ? 'reduce' : 'system';
      const initialFixture = write(`${mode}-${side}-fixture.json`, Buffer.from(JSON.stringify(side === 'source' ? fixture : { dataset: createSeedDataset(), theme: { theme: 'light', accent: 'indigo', motion: mode === 'stored-reduce' ? 'reduce' : 'system' }, clock: environment.clock }, null, 2) + '\n'));
      const session = await newPage(browser, {}, side === 'source' ? fixture : undefined, true, side === 'source' ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173');
      if (side === 'target') await session.context.addInitScript(stored => localStorage.setItem('task8.ui.theme.v1', JSON.stringify({ theme: 'light', accent: 'indigo', motion: stored ? 'reduce' : 'system' })), mode === 'stored-reduce');
      if (mode === 'os-reduce') await session.page.emulateMedia({ reducedMotion: 'reduce' });
      const fonts = [], pending = []; session.page.on('response', response => { if (/\.woff2(?:\?|$)/.test(response.url())) pending.push((async () => { const bytes = await response.body(); fonts.push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha256(bytes) }); })()); });
      await session.page.goto(side === 'source' ? 'http://127.0.0.1:4173/#login' : 'http://127.0.0.1:5173/login');
      await session.page.waitForSelector(side === 'source' ? '.auth-card.fx-auth' : '[data-auth-enter]');
      const timing = await session.page.locator(side === 'source' ? '.auth-card' : '[data-auth-card]').evaluate(el => [...el.children].slice(0, 6).map(node => ({ tag: node.tagName, display: getComputedStyle(node).display, duration: getComputedStyle(node).animationDuration, delay: getComputedStyle(node).animationDelay, easing: getComputedStyle(node).animationTimingFunction, frames: node.getAnimations().map(animation => animation.effect.getKeyframes().map(frame => ({ opacity: frame.opacity, transform: frame.transform }))) })));
      await session.page.evaluate(async () => { await Promise.all(['400 13.5px Geist', '500 13.5px Geist', '600 13.5px Geist', '400 12px "Geist Mono"'].map(face => document.fonts.load(face))); await document.fonts.ready; }); await Promise.all(pending);
      const loadedFaces = await session.page.evaluate(() => [...document.fonts].filter(font => font.status === 'loaded').map(font => ({ family: font.family, weight: font.weight, status: font.status })));
      assert.equal(loadedFaces.length, 4); assert.ok(fonts.length >= 2); assert.ok(fonts.every(font => font.status === 200 && font.bytes > 0));
      let scrollReset;
      if (mode === 'normal') {
        await session.page.setViewportSize({ width: 390, height: 844 }); await session.page.getByRole('button', { name: 'Sign up', exact: true }).first().click(); await session.page.waitForSelector('#signup-btn'); await ready(session.page);
        const selector = side === 'source' ? '.auth' : '[data-auth-layout]';
        const scroller = session.page.locator(selector), before = await scroller.evaluate(el => ({ top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight }));
        await session.page.mouse.move(195, 600); await session.page.mouse.wheel(0, 700); await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
        const reached = await scroller.evaluate(el => ({ top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight }));
        await session.page.locator('#signup-btn').click(); await ready(session.page); const reset = await scroller.evaluate(el => ({ top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight })); assert.equal(reset.top, 0); await expect(session.page.locator('#signup-btn')).toBeFocused();
        scrollReset = { before, reached, reset, actualWheel: true, focus: 'signup-btn' };
      }
      pair.push({ side, timing, initialFixture, fonts, loadedFaces, ...(scrollReset ? { scrollReset } : {}) }); await session.context.close();
    }
    for (const { timing } of pair) { assert.equal(timing[0].duration, reduced ? '0.12s' : '0.42s'); assert.equal(timing[1].delay, reduced ? '0s' : '0.04s'); assert.equal(timing[3].delay, reduced ? '0s' : '0.12s'); }
    for (let index = 0; index < 6; index++) { for (const key of ['duration', 'delay', 'easing', 'frames']) assert.deepEqual(pair[0].timing[index][key], pair[1].timing[index][key], `${mode} child${index + 1} ${key}`); }
    report.probes.push({ mode, reduced, pair, status: 'passed' }); save();
  }
  report.assetsAfter = assets(); report.immutableAfter = immutableInputs(); assert.deepEqual(report.assetsBefore, report.assetsAfter); assert.deepEqual(report.immutableBefore, report.immutableAfter); report.status = 'passed'; save(); console.log(JSON.stringify({ probes: report.probes.length, status: report.status }));
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; }
finally { await browser?.close(); await stopTarget(); await stopSource(); }
