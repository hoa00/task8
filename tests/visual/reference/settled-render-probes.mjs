import { writeFileSync, mkdirSync } from 'node:fs';
import { artifacts, root, readJson } from './source-check.mjs';
import { launch, newPage, origin } from './environment.mjs';
import { scenarios } from './scenarios.mjs';
import { setupScenario, readiness } from './source-driver.mjs';
import { compareImages } from './compare.mjs';
import { sourceServer } from './source-server.mjs';

const stopServer = await sourceServer();
let browser;
try { browser = await launch(); } catch (error) { await stopServer(); throw error; }
const results = [];
mkdirSync(`${root}test-results`, { recursive: true });
try {
  for (const id of ['SC-20-base', 'ON-06-step-5', 'MD-02-project', 'MD-01-task', 'MD-06-prompt', 'PO-user', 'PO-help', 'PO-estimate', 'PO-date', 'PO-sort', 'PO-group', 'PO-filter', 'PO-event', 'PO-bulk-assignee', 'DR-03-activity', 'MOBILE-modal']) {
    const paths = [];
    for (let run = 0; run < 3; run++) {
      const scenario = scenarios.find(scenario => scenario.id === id);
      const { page, context } = await newPage(browser, scenario, readJson(`${artifacts}/source-fixture.json`));
      try {
        await page.goto(origin);
        await page.waitForFunction(() => !!window.__gr8r);
        await setupScenario(page, scenario);
        await readiness(page);
        await page.evaluate(() => window.__gr8r.render());
        await readiness(page);
        const path = `${root}test-results/settled-${id}-${run}.png`;
        writeFileSync(path, await page.screenshot({ animations: 'allow', caret: 'hide', scale: 'css' }));
        paths.push(path);
      } finally { await context.close(); }
    }
    results.push({ id, independentContexts: 3, diffs: paths.slice(1).map(path => compareImages(paths[0], path).diffPixels) });
  }
  writeFileSync(`${artifacts}/settled-render-probes.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results));
  if (results.some(result => result.diffs.some(pixels => pixels > 0))) process.exitCode = 1;
} finally { try { await browser.close(); } finally { await stopServer(); } }
