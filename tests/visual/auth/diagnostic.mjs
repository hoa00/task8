import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { targetServer } from '../tasks/verify.mjs';
import { newPage } from '../reference/environment.mjs';
const stop = await targetServer(), browser = await chromium.launch({ args: ['--disable-partial-raster'] });
try { const { page, context } = await newPage(browser, {}, undefined, true, 'http://127.0.0.1:5173'); const errors = []; page.on('pageerror', error => errors.push(String(error.stack))); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); }); await page.goto('http://127.0.0.1:5173/login'); await page.waitForTimeout(2000); fs.mkdirSync('docs/poc/evidence/WU-26/attempts/diagnostic-01', { recursive: true }); await page.screenshot({ path: 'docs/poc/evidence/WU-26/attempts/diagnostic-01/target.png' }); console.log(JSON.stringify({ errors, body: await page.locator('body').innerText(), root: await page.locator('#root').getAttribute('data-data-mode') })); await context.close(); } finally { await browser.close(); await stop(); }
