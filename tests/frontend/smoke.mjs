import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { newPage } from '../visual/reference/environment.mjs';
import { sourceId } from '../../packages/contracts/src/source-identities.ts';
import { claimOutput, root } from './output.mjs';
const args = process.argv.slice(2);
assert(
  args.every((arg) => /^(?:--output=|--baseline=)/.test(arg)),
  'Use --output and optional --baseline',
);
const output = claimOutput(
  args.find((arg) => arg.startsWith('--output='))?.slice(9),
  'frontend-smoke',
);
const baseline = args.find((arg) => arg.startsWith('--baseline='))?.slice(11);
const report = {
  status: 'running',
  kind: 'format-regression-target-comparison',
  node: process.version,
  probes: [],
  pageErrors: [],
  screenshots: [],
  limitations: [
    'Target before/after formatting only; no source pixel parity or FR-02 behavior acceptance.',
  ],
};
const servers = [];
let browser;
async function serve(directory) {
  const base = resolve(root, directory);
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(base, '.' + path);
    if (!file.startsWith(base + '/') && file !== base) {
      response.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) file = join(base, 'index.html');
    const types = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
    };
    response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    response.end(readFileSync(file));
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
try {
  const currentOrigin = await serve('apps/web/dist');
  const baselineOrigin = baseline ? await serve(baseline) : null;
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  const workspace = sourceId('workspaces', 'w1');
  for (const width of [1440, 390]) {
    const targets = [];
    for (const origin of [baselineOrigin, currentOrigin].filter(Boolean)) {
      const context = await newPage(
        browser,
        { viewport: { width, height: 1000 } },
        undefined,
        true,
        origin,
      );
      context.page.on('pageerror', (error) => report.pageErrors.push(error.message));
      targets.push({ ...context, origin });
    }
    for (const [route, selector] of [
      ['home', '[data-home]'],
      ['tasks', '[data-list-scope]'],
      ['calendar', '[data-calendar-page]'],
    ]) {
      const captures = [];
      for (const target of targets) {
        await target.page.goto(`${target.origin}/w/${workspace}/${route}`);
        await expect(target.page.locator(selector)).toBeVisible();
        await target.page.evaluate(() => document.fonts.ready);
        await target.page.waitForTimeout(1400);
        captures.push(await target.page.screenshot({ animations: 'disabled' }));
      }
      const id = `${route}-${width}`;
      for (let index = 0; index < captures.length; index++)
        writeFileSync(join(output, `${id}-${index}.png`), captures[index]);
      if (baselineOrigin)
        assert.deepEqual(captures[0], captures[1], `${id}: formatting changed rendered target`);
      report.screenshots.push({
        id,
        sha256: captures.map((bytes) => createHash('sha256').update(bytes).digest('hex')),
        equal: baselineOrigin ? true : null,
      });
      report.probes.push({ id: `render-${id}`, pass: true });
    }
    const current = targets.at(-1);
    await current.page.goto(`${current.origin}/w/${workspace}/tasks`);
    await expect(current.page.locator('[data-list-scope]')).toBeVisible();
    await current.page.goto(`${current.origin}/w/${workspace}/calendar`);
    await current.page.goBack();
    await expect(current.page.locator('[data-list-scope]')).toBeVisible();
    await current.page.goForward();
    await expect(current.page.locator('[data-calendar-page]')).toBeVisible();
    await current.page.reload();
    await expect(current.page.locator('[data-calendar-page]')).toBeVisible();
    report.probes.push({ id: `navigation-back-forward-reload-${width}`, pass: true });
    for (const target of targets) await target.context.close();
  }
  assert.deepEqual(report.pageErrors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
