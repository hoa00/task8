import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import { artifacts, root, reference, readJson, sha256, checkSource } from './source-check.mjs';
import { environment, origin, launch, newPage } from './environment.mjs';
import { scenarios } from './scenarios.mjs';
import { setupScenario, readiness } from './source-driver.mjs';
import { compareManifests, compareImages, validateBaseline } from './compare.mjs';
import { sourceServer } from './source-server.mjs';

const mode = process.argv[2];
if (!['capture', 'verify', 'smoke'].includes(mode) || process.argv.length > 3) throw new Error('Use capture, verify or smoke; no snapshot update flags');
const source = checkSource();
const fixture = readJson(`${artifacts}/source-fixture.json`);
const fontManifest = readJson(`${artifacts}/font-assets.json`);
const registry = { schemaVersion: 1, sourceCommit: source.commit, scenarios };
const registryBytes = JSON.stringify(registry, null, 2) + '\n';
const directory = mode === 'capture' ? artifacts : `${root}test-results/${mode}`;
if (mode === 'verify') validateBaseline(artifacts);
if (mode === 'capture' && existsSync(`${artifacts}/baseline-manifest.json`) && readJson(`${artifacts}/baseline-manifest.json`).status === 'ready') throw new Error('Ready baseline is immutable; use verify');
mkdirSync(`${directory}/screenshots`, { recursive: true });
mkdirSync(`${directory}/metadata`, { recursive: true });
if (mode === 'capture') writeFileSync(`${artifacts}/scenario-registry.json`, registryBytes);
const inputs = ['source-fixture.json', 'source-identity-map.json', 'font-assets.json', 'scenario-registry.json', ...fontManifest.assets.map(asset => asset.path), ...fontManifest.notices.map(notice => notice.path)].map(path => ({ path, sha256: path === 'scenario-registry.json' ? sha256(registryBytes) : sha256(readFileSync(`${artifacts}/${path}`)) }));
const stopServer = await sourceServer();
let browser;
try { browser = await launch(); } catch (error) { await stopServer(); throw error; }
const manifest = {
  schemaVersion: 1, kind: 'source-runtime-baseline', sourceCommit: source.commit,
  environment, runner: { node: process.version, pnpm: '11.19.0', playwright: '1.58.2', chromiumRevision: '1208', browser: browser.version(), os: os.platform(), release: os.release(), arch: os.arch() },
  fixtureVersion: 1, fixtureSha256: sha256(readFileSync(`${artifacts}/source-fixture.json`)),
  fontManifestSha256: sha256(readFileSync(`${artifacts}/font-assets.json`)), registrySha256: sha256(registryBytes),
  sourceOrigin: origin, sourceCheckout: '.reference/gr8r-studio', sourceValidation: source,
  captureOptions: { animations: 'allow', caret: 'hide', scale: 'css', fullPage: false, threshold: 0, includeAA: true, maxDiffPixels: 0, masks: [] },
  inputs, scenarioCount: scenarios.length, cases: [], errors: [], status: 'incomplete',
};
const selected = mode === 'smoke' ? scenarios.filter(scenario => ['SC-01-base', 'PR-02-board', 'PR-04-table', 'SC-11-base', 'SC-12-base', 'DR-01-side', 'SE-02-appearance', 'AU-01-login', 'MOBILE-home', 'MD-01-task', 'PO-date'].includes(scenario.id)) : scenarios;
try {
  for (const scenario of selected) {
    let context;
    try {
      const session = await newPage(browser, scenario, fixture);
      context = session.context;
      const errors = [];
      session.page.on('pageerror', error => errors.push(error.message));
      await session.page.goto(origin);
      await session.page.waitForFunction(() => !!window.__gr8r);
      await setupScenario(session.page, scenario);
      let ready = await readiness(session.page);
      if (scenario.settleRender) {
        await session.page.evaluate(() => window.__gr8r.render());
        ready = await readiness(session.page);
      }
      if (errors.length) throw new Error(`Source runtime error: ${errors.join('; ')}`);
      if (ready.icon && (ready.icon.strokeWidth !== '1.8' || ready.icon.viewBox !== '0 0 24 24')) throw new Error('Source icon contract differs');
      const screenshot = `screenshots/${scenario.id}.png`;
      const bytes = await session.page.screenshot(manifest.captureOptions);
      if (mode === 'capture' && existsSync(`${directory}/${screenshot}`)) {
        const temp = `${root}test-results/existing-reference.png`;
        mkdirSync(`${root}test-results`, { recursive: true });
        writeFileSync(temp, bytes);
        if (compareImages(`${directory}/${screenshot}`, temp).diffPixels) throw new Error('Existing source image differs; baseline updates are forbidden');
      } else writeFileSync(`${directory}/${screenshot}`, bytes);
      const metadata = `metadata/${scenario.id}.json`;
      const metadataBytes = JSON.stringify({ scenario, readiness: ready, requests: session.requests, sourceCommit: source.commit, environment, runner: manifest.runner, viewport: scenario.viewport || { width: 1440, height: 1000 }, dpr: 1, mobile: !!scenario.mobile, touch: !!scenario.mobile, pointer: scenario.mobile ? 'coarse' : 'fine', screenshot }, null, 2) + '\n';
      writeFileSync(`${directory}/${metadata}`, metadataBytes);
      manifest.cases.push({ id: scenario.id, family: scenario.family, screenshot, sha256: sha256(bytes), metadata, metadataSha256: sha256(metadataBytes), readiness: 'passed' });
      console.log(`PASS ${scenario.id}`);
    } catch (error) {
      manifest.errors.push({ id: scenario.id, message: error.message });
      console.error(`FAIL ${scenario.id}: ${error.message}`);
    } finally { await context?.close(); }
    writeFileSync(`${directory}/baseline-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  }
} finally { try { await browser.close(); } finally { await stopServer(); } }
manifest.status = manifest.cases.length === scenarios.length && !manifest.errors.length ? 'ready' : 'incomplete';
checkSource();
writeFileSync(`${directory}/baseline-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
if (mode === 'verify' && manifest.status === 'ready') {
  const results = compareManifests(artifacts, directory, `${root}test-results/repeatability-diffs`);
  const report = { baselineManifestSha256: sha256(readFileSync(`${artifacts}/baseline-manifest.json`)), runner: manifest.runner, comparedCases: results.length, maxDiffPixels: 0, totalDiffPixels: results.reduce((sum, result) => sum + result.diffPixels, 0), results, status: results.every(result => result.diffPixels === 0) ? 'passed' : 'failed' };
  writeFileSync(`${artifacts}/repeatability.json`, JSON.stringify(report, null, 2) + '\n');
  if (report.status !== 'passed') process.exitCode = 1;
  console.log(JSON.stringify({ status: report.status, comparedCases: results.length, totalDiffPixels: report.totalDiffPixels }));
}
if (manifest.errors.length) process.exitCode = 1;
console.log(JSON.stringify({ mode, passed: manifest.cases.length, failed: manifest.errors.length, status: manifest.status }));
