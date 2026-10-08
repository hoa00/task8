import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { artifacts, readJson, checkSource } from './source-check.mjs';
import { launch, newPage, origin } from './environment.mjs';
import { sourceServer } from './source-server.mjs';
import { readiness } from './source-driver.mjs';

checkSource();
const stopServer = await sourceServer();
let browser;
try { browser = await launch(); } catch (error) { await stopServer(); throw error; }
const fixture = readJson(`${artifacts}/source-fixture.json`);
const results = [];
try {
  for (const width of [639, 640, 641, 899, 900, 901, 1099, 1100, 1101]) {
    const { context, page } = await newPage(browser, { viewport: { width, height: 1000 } }, fixture);
    try {
      await page.goto(origin);
      await page.waitForFunction(() => !!window.__gr8r);
      const measured = await page.evaluate(() => {
        const side = getComputedStyle(document.querySelector('.side'));
        const topbar = document.querySelector('.topbar').getBoundingClientRect();
        const searchLabel = getComputedStyle(document.querySelector('.topsearch .lbltxt'));
        const bottom = document.querySelector('.bottomnav');
        return { width: innerWidth, sideWidth: side.width, sidePosition: side.position, topbarHeight: topbar.height, searchLabelDisplay: searchLabel.display, bottomnavDisplay: bottom ? getComputedStyle(bottom).display : 'absent' };
      });
      assert.equal(measured.topbarHeight, width <= 640 ? 50 : 46);
      assert.equal(measured.sideWidth, width <= 900 ? '280px' : '252px');
      assert.equal(measured.searchLabelDisplay === 'none', width <= 1100);
      results.push({ id: `inclusive-breakpoint-${width}`, status: 'passed', measured });
      await page.evaluate(() => {
        const { S, go } = window.__gr8r;
        S.ui.drawer = S.data.tasks[0].id;
        go('tasks');
      });
      const retainedDrawer = await page.evaluate(() => window.__gr8r.S.ui.drawer !== null);
      assert.equal(retainedDrawer, width >= 900);
      results.push({ id: `go-drawer-boundary-${width}`, status: 'passed', retainedDrawer });
      if (width === 640) {
        await page.evaluate(() => window.__gr8r.go('calendar'));
        const rows = await page.locator('.cal-g').evaluate(el => ({ inline: el.style.gridTemplateRows, computed: getComputedStyle(el).gridTemplateRows, auto: getComputedStyle(el).gridAutoRows }));
        results.push({ id: 'mobile-calendar-inline-rows', status: 'observed-source-nuance', measured: rows });
      }
    } finally { await context.close(); }
  }
  {
    const { context, page } = await newPage(browser, {}, fixture);
    try {
      await page.goto(origin);
      await page.waitForFunction(() => !!window.__gr8r);
      await page.evaluate(() => window.__gr8r.go('tasks'));
      const opener = page.locator('[data-a="openTask"]').first();
      const taskId = await opener.getAttribute('data-id');
      await opener.click();
      await page.locator('.drawer').waitFor();
      const motion = await page.locator('.drawer').evaluate(el => ({ duration: getComputedStyle(el).animationDuration, width: el.getBoundingClientRect().width }));
      assert.equal(motion.width, 620);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.drawer').count(), 0);
      const focus = await page.evaluate(() => ({ action: document.activeElement.dataset.a, id: document.activeElement.dataset.id }));
      results.push({ id: 'drawer-open-escape-focus', status: focus.action === 'openTask' && focus.id === taskId ? 'passed' : 'observed-source-issue', motion, focus, expected: { action: 'openTask', id: taskId } });
      await page.evaluate(() => window.__gr8r.go('home'));
      const oldHash = await page.evaluate(() => location.hash);
      await page.evaluate(() => window.__gr8r.go('projects'));
      assert.equal(await page.evaluate(() => location.hash), oldHash);
      results.push({ id: 'source-memory-navigation', status: 'observed-source-nuance', hash: oldHash });
      await page.evaluate(() => { window.__gr8r.S.ui.auth = 'login'; window.__gr8r.render(); });
      const subtitle = await page.locator('.auth-card .sub').evaluate(el => ({ text: el.textContent, display: getComputedStyle(el).display, visibility: getComputedStyle(el).visibility }));
      results.push({ id: 'auth-subtitle', status: subtitle.display === 'none' ? 'observed-source-issue' : 'observed', measured: subtitle });
    } finally { await context.close(); }
  }
  {
    const { context, page } = await newPage(browser, {}, fixture);
    try {
      await context.route(/^https:\/\/fonts\./, route => route.abort('failed'));
      await page.goto(origin);
      await page.waitForFunction(() => !!window.__gr8r);
      let error;
      try { await readiness(page); } catch (caught) { error = caught.message; }
      assert.ok(error, 'Missing fonts must fail readiness');
      results.push({ id: 'missing-font-negative-gate', status: 'passed', expectedFailure: error });
    } finally { await context.close(); }
  }
  writeFileSync(`${artifacts}/interaction-probes.json`, JSON.stringify({ sourceCommit: checkSource().commit, results }, null, 2) + '\n');
  console.log(JSON.stringify({ probes: results.length, sourceIssues: results.filter(result => result.status === 'observed-source-issue') }));
} finally { try { await browser.close(); } finally { await stopServer(); } }
