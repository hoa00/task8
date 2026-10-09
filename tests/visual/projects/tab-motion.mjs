import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { sourceIdentities } from '../../../packages/contracts/src/source-identities.ts';
import { newPage } from '../reference/environment.mjs';
import { artifacts, readJson, checkSource } from '../reference/source-check.mjs';
import { sourceServer } from '../reference/source-server.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';

// Passive native behavior inspection. No screenshots, animation controls or
// acceptance claim: the active underline is a visible Source-owned transition.
const root = 'docs/poc/evidence/WU-16/diagnostics', report = { samples: [], purpose: 'Native active Project tab pseudo-element lifecycle, Source versus Target; no raster cause claim.' };
const sid = (collection, sourceId) => sourceIdentities.find(row => row.collection === collection && row.sourceId === sourceId).id;
const workspace = sid('workspaces', 'w1'), stopSource = await sourceServer(), stopTarget = await targetServer(); let browser;
async function measure(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[aria-label="Project views"] [aria-current=page]'), css = getComputedStyle(el, '::after');
    return { title: el.textContent, rect: el.getBoundingClientRect().toJSON(), animation: Object.fromEntries(['animationName', 'animationDuration', 'animationTimingFunction', 'animationFillMode', 'animationIterationCount', 'transform', 'opacity'].map(key => [key, css[key]])), events: window.__tabMotionEvents, projectFlag: document.querySelector('[data-project-host]')?.dataset.projectTransition, sourceShell: document.querySelector('.shell')?.className };
  });
}
try {
  browser = await chromium.launch();
  for (const reduced of [false, true]) {
    const a = await newPage(browser, {}, readJson(`${artifacts}/source-fixture.json`)), b = await newPage(browser, {}, undefined, true, 'http://127.0.0.1:5173');
    for (const { page } of [a, b]) {
      if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(() => { window.__tabMotionEvents = []; for (const type of ['animationstart', 'animationend']) document.addEventListener(type, event => { if (event.pseudoElement === '::after' && event.target.closest('[aria-label="Project views"]')) window.__tabMotionEvents.push({ type, name: event.animationName, pseudo: event.pseudoElement, title: event.target.textContent, elapsed: event.elapsedTime }); }); });
    }
    await a.page.goto('http://127.0.0.1:4173'); await b.page.goto(`http://127.0.0.1:5173/project-routes.html?path=/w/${workspace}/home`);
    for (const { page } of [a, b]) await ready(page);
    await a.page.locator('.side [role=link][data-r=project][data-id=p1]').click();
    await b.page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Website Redesign', exact: true }).click();
    await b.page.waitForSelector('[data-query-coverage=complete]');
    for (const { page } of [a, b]) await ready(page);
    const route = await Promise.all([a.page, b.page].map(measure));
    await a.page.getByRole('navigation', { name: 'Project views', exact: true }).getByRole('button', { name: 'List', exact: true }).click();
    await b.page.getByRole('navigation', { name: 'Project views', exact: true }).getByRole('link', { name: 'List', exact: true }).click();
    for (const { page } of [a, b]) await ready(page);
    const tab = await Promise.all([a.page, b.page].map(measure));
    for (const { page } of [a, b]) { const favorite = page.getByRole('button', { name: 'Favorite', exact: true }), before = await favorite.getAttribute('aria-pressed'); await favorite.click(); await page.waitForFunction(previous => document.querySelector('[aria-label=Favorite]').getAttribute('aria-pressed') !== previous, before); await ready(page); }
    const mutated = await Promise.all([a.page, b.page].map(measure));
    const eventCounts = mutated.map(row => row.events.length);
    for (const { page } of [a, b]) { await page.emulateMedia({ reducedMotion: reduced ? 'no-preference' : 'reduce' }); await ready(page); }
    const changedPreference = await Promise.all([a.page, b.page].map(measure));
    report.samples.push({ reduced, route, tab, mutated, changedPreference, mutationEventCounts: eventCounts, preferenceEventCounts: changedPreference.map(row => row.events.length) });
    if (process.argv.includes('--verify')) {
      for (const stage of [route, tab]) {
        const [source, target] = stage;
        assert.equal(source.animation.animationName, reduced ? 'fadeOnly' : 'tabIn');
        assert.equal(target.animation.animationName, reduced ? 'fadeOnly' : 'projectTabIn');
        for (const key of ['animationDuration','animationTimingFunction','animationFillMode','animationIterationCount','transform','opacity']) assert.equal(target.animation[key], source.animation[key]);
        assert.equal(target.events.filter(event => event.type === 'animationstart').length, stage === route ? 1 : 2);
        assert.equal(target.events.filter(event => event.type === 'animationend').length, stage === route ? 1 : 2);
      }
      assert.equal(mutated[1].animation.animationName, 'none');
      assert.equal(changedPreference[1].animation.animationName, 'none');
      assert.equal(changedPreference[1].events.length, tab[1].events.length);
    }
    await a.context.close(); await b.context.close();
  }
  checkSource(); report.status = process.argv.includes('--verify') ? 'passed' : 'recorded';
} catch (error) { report.status = 'failed'; report.error = String(error); throw error; }
finally { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(`${root}/active-tab-motion.json`, JSON.stringify(report, null, 2) + '\n'); await browser?.close(); await stopTarget(); await stopSource(); }
