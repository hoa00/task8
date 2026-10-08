import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { artifacts, readJson, sha256 } from './source-check.mjs';

export const environment = {
  clock: '2026-10-08T09:00:00.000Z', randomSeed: 804205,
  locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1,
  platform: 'MacIntel', modKey: '⌘',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.6 Safari/537.36',
};
export const origin = 'http://127.0.0.1:4173';
export const launch = () => {
  if (process.version !== 'v24.13.0') throw new Error('Capture runner requires Node v24.13.0 from .node-version');
  return chromium.launch({ headless: true });
};

export async function newPage(browser, scenario = {}, fixture, offlineFonts = true, baseUrl = origin) {
  const context = await browser.newContext({
    viewport: scenario.viewport || { width: 1440, height: 1000 },
    locale: environment.locale, timezoneId: environment.timezoneId,
    deviceScaleFactor: 1, userAgent: environment.userAgent,
    colorScheme: scenario.colorScheme || 'light', hasTouch: !!scenario.mobile,
    isMobile: !!scenario.mobile, reducedMotion: 'no-preference',
  });
  const requests = [];
  if (offlineFonts) {
    const manifest = readJson(`${artifacts}/font-assets.json`);
    for (const asset of manifest.assets) {
      const body = readFileSync(`${artifacts}/${asset.path}`);
      if (sha256(body) !== asset.sha256) throw new Error(`Font hash differs: ${asset.path}`);
    }
    await context.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => {
      const asset = manifest.assets.find(item => item.url === route.request().url());
      if (!asset) return route.abort('failed');
      const body = readFileSync(`${artifacts}/${asset.path}`);
      requests.push({ url: asset.url, sha256: asset.sha256, status: 200 });
      return route.fulfill({ status: 200, body, contentType: asset.contentType, headers: { 'access-control-allow-origin': '*' } });
    });
  }
  await context.addInitScript(({ config, fixture, baseUrl }) => {
    // Date is fixed before source imports; performance/timers remain real so countUp and motion can settle.
    const OriginalDate = Date;
    class FixedDate extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [config.clock])); }
      static now() { return new OriginalDate(config.clock).getTime(); }
    }
    window.Date = FixedDate;
    let state = config.randomSeed;
    Math.random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    Object.defineProperty(navigator, 'platform', { get: () => config.platform });
    if (fixture && location.origin === baseUrl) localStorage.setItem('gr8r.v2', JSON.stringify(fixture));
  }, { config: environment, fixture, baseUrl });
  const page = await context.newPage();
  return { context, page, requests };
}
