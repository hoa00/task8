import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { artifacts, readJson } from './source-check.mjs';
import { launch } from './environment.mjs';

const manifest = readJson(`${artifacts}/baseline-manifest.json`);
mkdirSync(`${artifacts}/review`, { recursive: true });
const browser = await launch();
const sheets = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  for (let start = 0; start < manifest.cases.length; start += 18) {
    const entries = manifest.cases.slice(start, start + 18);
    const cards = entries.map(entry => `<figure><figcaption>${entry.id}</figcaption><img src="data:image/png;base64,${readFileSync(`${artifacts}/${entry.screenshot}`).toString('base64')}"></figure>`).join('');
    await page.setContent(`<style>body{margin:0;background:#ddd;display:grid;grid-template-columns:repeat(3,480px);font:14px monospace}figure{margin:0;height:360px;padding:5px;box-sizing:border-box}figcaption{height:22px}img{width:470px;height:327px;object-fit:contain;object-position:top;background:white}</style>${cards}`);
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    const path = `review/sheet-${String(sheets.length + 1).padStart(2, '0')}.png`;
    await page.screenshot({ path: `${artifacts}/${path}`, fullPage: true });
    sheets.push({ path, scenarios: entries.map(entry => entry.id), role: 'Review contact sheet only; original screenshots remain the reference.' });
  }
  writeFileSync(`${artifacts}/review/sheet-index.json`, JSON.stringify(sheets, null, 2) + '\n');
  console.log(JSON.stringify({ reviewSheets: sheets.length, scenarios: manifest.cases.length }));
} finally { await browser.close(); }
