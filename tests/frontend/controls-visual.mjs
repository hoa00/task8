import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { sourceServer } from '../visual/reference/source-server.mjs';
import { newPage, environment } from '../visual/reference/environment.mjs';
import { artifacts, checkSource, sha256 } from '../visual/reference/source-check.mjs';
import { sourcePreferences } from '../visual/foundation/source-sample.mjs';
import { sourceControls } from '../visual/controls/source-sample.mjs';
import { claimOutput } from './output.mjs';
import { startBrowserServer } from './browser-server.mjs';
const args = process.argv.slice(2),
  output = claimOutput(
    args.find((arg) => arg.startsWith('--output='))?.slice(9),
    'controls-visual',
  );
const groups = ['fields', 'choices', 'feedback', 'select'],
  immutable = [
    'baseline-manifest.json',
    'font-assets.json',
    'source-fixture.json',
    'source-lock.json',
  ];
const hashes = () =>
  Object.fromEntries(immutable.map((name) => [name, sha256(readFileSync(join(artifacts, name)))]));
const report = {
  status: 'running',
  sourceSha: '904205c626918ee96054eb35495c394a60c0c601',
  environment,
  samples: [],
  pageErrors: [],
  immutableBefore: hashes(),
  limitations: [
    'Animations sampled at their real 650ms frame for deterministic source/target comparison; affected primitive samples in light/dark with indigo; historical Darwin evidence and broader source visual debt unchanged.',
  ],
};
let browser, stopSource, target;
function pixels(a, b) {
  const left = PNG.sync.read(a),
    right = PNG.sync.read(b);
  assert.equal(left.width, right.width);
  assert.equal(left.height, right.height);
  const diff = new PNG({ width: left.width, height: left.height });
  return {
    count: pixelmatch(left.data, right.data, diff.data, left.width, left.height, {
      threshold: 0,
      includeAA: true,
    }),
    diff,
  };
}
async function ready(p) {
  await p.evaluate(async () => {
    await document.fonts.ready;
    for (const spec of [
      '400 13.5px Geist',
      '500 13.5px Geist',
      '600 13.5px Geist',
      '400 11px "Geist Mono"',
    ]) {
      const fonts = await document.fonts.load(spec, 'Gr8r 123');
      if (!fonts.length || fonts.some((font) => font.status !== 'loaded'))
        throw Error('Missing font ' + spec);
    }
  });
  await p.mouse.move(1200, 900);
  await p.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}
try {
  checkSource();
  stopSource = await sourceServer();
  target = await startBrowserServer();
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  for (const group of groups)
    for (const theme of ['light', 'dark']) {
      const left = await newPage(browser),
        right = await newPage(browser, {}, undefined, true, target.origin),
        id = group + '-' + theme;
      try {
        for (const [name, p] of [
          ['source', left.page],
          ['target', right.page],
        ])
          p.on('pageerror', (error) =>
            report.pageErrors.push({ id, name, message: error.message }),
          );
        await right.context.addInitScript(
          (theme) =>
            localStorage.setItem(
              'task8.ui.theme.v1',
              JSON.stringify({
                theme,
                accent: 'indigo',
                side: 'comfortable',
                density: 'comfortable',
                motion: 'system',
              }),
            ),
          theme,
        );
        await left.page.goto('http://127.0.0.1:4173');
        await sourcePreferences(left.page, { theme, accent: 'indigo' });
        await sourceControls(left.page, group);
        await right.page.goto(target.origin + '/controls.html');
        await right.page.getByLabel('Group', { exact: true }).selectOption(group);
        await right.page.getByLabel('Theme', { exact: true }).selectOption(theme);
        await right.page.getByLabel('Accent', { exact: true }).selectOption('indigo');
        await ready(left.page);
        await ready(right.page);
        const animationFrames = [];
        for (const page of [left.page, right.page])
          animationFrames.push(
            await page.locator('#controls-sample').evaluate((node) =>
              node.getAnimations({ subtree: true }).map((animation) => {
                animation.pause();
                animation.currentTime = 650;
                return {
                  name: animation.animationName,
                  time: animation.currentTime,
                  duration: animation.effect.getTiming().duration,
                };
              }),
            ),
          );
        const a = await left.page
            .locator('#controls-sample')
            .screenshot({ animations: 'allow', caret: 'initial' }),
          repeat = await left.page
            .locator('#controls-sample')
            .screenshot({ animations: 'allow', caret: 'initial' }),
          b = await right.page
            .locator('#controls-sample')
            .screenshot({ animations: 'allow', caret: 'initial' });
        const result = pixels(a, b),
          stable = pixels(a, repeat).count;
        writeFileSync(join(output, id + '-source.png'), a);
        writeFileSync(join(output, id + '-target.png'), b);
        if (result.count)
          writeFileSync(join(output, id + '-diff.png'), PNG.sync.write(result.diff));
        report.samples.push({
          id,
          animationFrames,
          changedPixels: result.count,
          repeatabilityPixels: stable,
          sourceSha256: sha256(a),
          targetSha256: sha256(b),
          pass: result.count === 0 && stable === 0,
        });
      } catch (error) {
        report.samples.push({ id, pass: false, error: String(error.stack) });
      } finally {
        await left.context.close();
        await right.context.close();
        writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
      }
    }
  report.immutableAfter = hashes();
  assert.deepEqual(report.immutableAfter, report.immutableBefore);
  report.status =
    report.samples.every((row) => row.pass) && !report.pageErrors.length ? 'passed' : 'failed';
} finally {
  if (browser) await browser.close();
  if (target) await target.stop();
  if (stopSource) await stopSource();
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
