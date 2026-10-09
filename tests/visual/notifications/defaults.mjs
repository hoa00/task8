import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sourceServer } from '../reference/source-server.mjs';
import { newPage, environment } from '../reference/environment.mjs';
import { artifacts, checkSource, readJson, sha256 } from '../reference/source-check.mjs';
import { ready, targetServer } from '../tasks/verify.mjs';
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';

const attempt = process.argv.find(arg => arg.startsWith('--attempt='))?.slice(10);
if (!attempt) throw Error('Unique attempt required');
const output = `docs/poc/evidence/WU-19/attempts/${attempt}`;
if (fs.existsSync(output)) throw Error('Never overwrite');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync('tests/visual/notifications/defaults.mjs', `${output}/executed-harness.mjs`);
const immutable = () => Object.fromEntries(['baseline-manifest.json', 'font-assets.json', 'source-fixture.json', 'source-lock.json'].map(name => [name, sha256(fs.readFileSync(`${artifacts}/${name}`))]));
const report = { status: 'running', samples: [], runtime: { node: process.version, ...environment }, immutableBefore: immutable(), scope: 'Bounded actual default Drawer CommentComposer and default md Avatar composition only, desktop/mobile; matched BOTH Chromium145 Linux disable-partial-raster. No broad Drawer/fullshell acceptance.' };
const save = () => fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
const compare = (a, b) => { const x = PNG.sync.read(a), y = PNG.sync.read(b); assert.equal(x.width, y.width); assert.equal(x.height, y.height); return pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0, includeAA: true }); };
const stopSource = await sourceServer(), stopTarget = await targetServer(); let browser;
try {
  checkSource(); browser = await chromium.launch({ headless: true, args: ['--disable-partial-raster'] }); report.runtime.browser = browser.version();
  for (const width of [1440, 390]) {
    const sessions = [], metadata = [], captures = [];
    for (const side of ['source', 'target']) {
      const session = await newPage(browser, { viewport: { width, height: 1000 }, mobile: width === 390 }, side === 'source' ? readJson(`${artifacts}/source-fixture.json`) : undefined, true, side === 'source' ? undefined : 'http://127.0.0.1:5173'); sessions.push(session);
      const p = session.page;
      await p.goto(side === 'source' ? 'http://127.0.0.1:4173' : `http://127.0.0.1:5173/w/${sourceId('workspaces', 'w1')}/inbox`);
      if (side === 'source') { if (width <= 900) await p.getByRole('button', { name: 'Open navigation', exact: true }).click(); await p.locator('.side [data-r=inbox]').click(); }
      else await p.waitForSelector('[data-notifications-ready]');
      await p.locator(side === 'source' ? '[data-a=selNotif][data-id=n1]' : `[data-notification-id="${sourceId('notifs', 'n1')}"]`).click();
      if (side === 'target') await p.waitForSelector('[data-conversation-ready]');
      await p.getByRole('button', { name: 'Open task', exact: true }).click(); await p.locator(side === 'source' ? '.drawer' : '[data-task-drawer]').waitFor();
      const textarea = p.getByRole('textbox', { name: 'Comment', exact: true }); await textarea.waitFor();
      await p.locator(side === 'source' ? '.drawer-b' : '.task-drawer-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await p.evaluate(() => document.activeElement?.blur()); await p.mouse.move(0, 0); await ready(p);
      const container = textarea.locator('..').locator('..').locator('..');
      const meta = await container.evaluate(el => ({ rect: el.getBoundingClientRect().toJSON(), textarea: { rect: el.querySelector('textarea').getBoundingClientRect().toJSON(), height: getComputedStyle(el.querySelector('textarea')).height, placeholder: el.querySelector('textarea').placeholder }, avatar: { rect: el.querySelector('.av,[role=img]').getBoundingClientRect().toJSON(), text: el.querySelector('.av,[role=img]').textContent }, attachment: !!el.querySelector('input[type=file]'), mention: !!el.querySelector('[aria-label=Mention]') }));
      const clip = { x: Math.floor(meta.rect.x), y: Math.floor(meta.rect.y), width: Math.ceil(meta.rect.right) - Math.floor(meta.rect.x), height: Math.ceil(meta.rect.bottom) - Math.floor(meta.rect.y) };
      for (let n = 0; n < 2; n++) await p.screenshot({ clip, animations: 'disabled', caret: 'hide' });
      const original = await p.screenshot({ clip, animations: 'disabled', caret: 'hide' }), repeat = await p.screenshot({ clip, animations: 'disabled', caret: 'hide' });
      fs.writeFileSync(`${output}/drawer-composer-${width}-${side}.png`, original); fs.writeFileSync(`${output}/drawer-composer-${width}-${side}-repeat.png`, repeat);
      metadata.push({ side, ...meta, clip }); captures.push({ original, repeat });
      assert.equal(meta.avatar.rect.width, 26); assert.equal(meta.avatar.rect.height, 26); assert.equal(meta.attachment, true); assert.equal(meta.mention, true);
    }
    assert.equal(metadata[0].clip.width, metadata[1].clip.width); assert.equal(metadata[0].clip.height, metadata[1].clip.height);
    const pixels = compare(captures[0].original, captures[1].original), repeatPixels = compare(captures[0].original, captures[0].repeat) + compare(captures[1].original, captures[1].repeat);
    report.samples.push({ width, metadata, changedPixels: pixels, repeatabilityPixels: repeatPixels, pngSha256: captures.map(({ original, repeat }) => ({ original: sha256(original), repeat: sha256(repeat) })) }); save(); console.log(`${width}: pixels${pixels} repeat${repeatPixels}`); for (const session of sessions) await session.context.close();
  }
  report.immutableAfter = immutable(); assert.deepEqual(report.immutableBefore, report.immutableAfter); checkSource(); assert.ok(report.samples.every(row => !row.changedPixels && !row.repeatabilityPixels)); report.status = 'passed'; save();
} catch (error) { report.status = 'failed'; report.error = String(error.stack); save(); throw error; } finally { await browser?.close(); await stopTarget(); await stopSource(); }
