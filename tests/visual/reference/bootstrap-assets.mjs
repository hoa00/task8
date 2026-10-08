import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { artifacts, reference, sha256, checkSource } from './source-check.mjs';
import { environment, origin, launch, newPage } from './environment.mjs';
import { sourceServer } from './source-server.mjs';

checkSource();
if (existsSync(`${artifacts}/font-assets.json`)) throw new Error('Acquired font bytes are immutable; bootstrap must not update existing inputs');
mkdirSync(`${artifacts}/assets`, { recursive: true });
const stopServer = await sourceServer();
let browser;
try { browser = await launch(); } catch (error) { await stopServer(); throw error; }
try {
  const { context, page } = await newPage(browser, {}, undefined, false);
  const responses = [];
  page.on('response', response => {
    if (/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(response.url())) responses.push(response);
  });
  await page.goto(origin);
  await page.waitForFunction(() => !!window.__gr8r);
  await page.evaluate(() => document.fonts.ready);
  const assets = [];
  for (const response of responses) {
    if (!response.ok()) throw new Error(`Font response failed: ${response.url()}`);
    const body = await response.body();
    const contentType = response.headers()['content-type'];
    const path = `assets/${sha256(body)}.${contentType.includes('text/css') ? 'css' : 'woff2'}`;
    writeFileSync(`${artifacts}/${path}`, body);
    assets.push({ url: response.url(), contentType, path, sha256: sha256(body), sizeBytes: body.length, browserRequested: true });
  }
  const stylesheet = assets.find(asset => asset.contentType.includes('text/css'));
  if (!stylesheet) throw new Error('Original font stylesheet did not load');
  const css = readFileSync(`${artifacts}/${stylesheet.path}`, 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(match => {
    const descriptors = Object.fromEntries([...match[1].matchAll(/([\w-]+):\s*([^;]+);/g)].map(item => [item[1], item[2].trim()]));
    return { ...descriptors, url: /url\(([^)]+)\)/.exec(descriptors.src)[1] };
  });
  // Preserve every subset referenced by the exact browser-selected stylesheet, including subsets unused by the seed.
  for (const url of new Set(faces.map(face => face.url))) {
    if (assets.some(asset => asset.url === url)) continue;
    const response = await context.request.get(url);
    if (!response.ok()) throw new Error(`Font subset download failed: ${url}`);
    const body = await response.body();
    const path = `assets/${sha256(body)}.woff2`;
    writeFileSync(`${artifacts}/${path}`, body);
    assets.push({ url, contentType: 'font/woff2', path, sha256: sha256(body), sizeBytes: body.length, browserRequested: false });
  }
  const notices = [];
  for (const family of ['geist', 'geistmono']) {
    const url = `https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`;
    const response = await context.request.get(url);
    if (!response.ok()) throw new Error(`Missing font notice: ${url}`);
    const body = await response.body();
    const path = `assets/${family}-OFL.txt`;
    writeFileSync(`${artifacts}/${path}`, body);
    notices.push({ family, url, path, sha256: sha256(body), note: 'Notice from Google Fonts distribution; does not grant a license to upstream app/design/logo.' });
  }
  const lucideLicense = readFileSync(`${reference}/node_modules/lucide/LICENSE`);
  writeFileSync(`${artifacts}/assets/lucide-LICENSE`, lucideLicense);
  notices.push({ family: 'lucide', version: '0.460.0', path: 'assets/lucide-LICENSE', sha256: sha256(lucideLicense) });
  const loadedFaces = await page.evaluate(() => [...document.fonts].map(face => ({ family: face.family, weight: face.weight, style: face.style, status: face.status, unicodeRange: face.unicodeRange })));
  if (!loadedFaces.some(face => face.family === 'Geist' && face.status === 'loaded')) throw new Error('Geist fell back');
  writeFileSync(`${artifacts}/font-assets.json`, JSON.stringify({ schemaVersion: 1, environment, assets, faces, loadedFaces, notices }, null, 2) + '\n');
  const fixture = await page.evaluate(async () => {
    const { teamsList } = await import('/src/core/store.js');
    teamsList();
    const { S } = window.__gr8r;
    return { data: S.data, prefs: { ...S.prefs, theme: 'light' }, views: {}, collapsed: false };
  });
  writeFileSync(`${artifacts}/source-fixture.json`, JSON.stringify(fixture, null, 2) + '\n');
  const identity = Object.entries(fixture.data).filter(([, value]) => Array.isArray(value)).flatMap(([collection, records]) => records.filter(record => typeof record === 'object' && record.id).map(record => ({
    collection, sourceId: record.id, visibleKey: record.key ?? null,
    relationships: Object.fromEntries(Object.entries(record).filter(([key]) => ['project', 'task', 'by', 'assignee', 'members', 'team', 'lead', 'deps', 'attachments', 'subtasks'].includes(key))),
  })));
  writeFileSync(`${artifacts}/source-identity-map.json`, JSON.stringify({ schemaVersion: 1, sourceCommit: checkSource().commit, fixtureSha256: sha256(readFileSync(`${artifacts}/source-fixture.json`)), purpose: 'Source IDs and relationships only; canonical UUIDv7/schema conversion belongs to WU-02.', records: identity }, null, 2) + '\n');
  console.log(JSON.stringify({ fontAssets: assets.length, faces: faces.length, fixtureCollections: Object.keys(fixture.data), browser: browser.version() }));
  await context.close();
} finally { try { await browser.close(); } finally { await stopServer(); } }
