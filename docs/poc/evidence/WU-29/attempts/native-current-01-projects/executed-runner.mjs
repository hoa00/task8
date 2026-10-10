import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sha256, checkSource } from '../reference/source-check.mjs';
import { immutableInputs, implementationAssets, httpBuildAssets, sourceAssets } from '../settings/assets.mjs';

const attempt = process.argv[2], input = process.argv[3], output = `docs/poc/evidence/WU-29/attempts/${attempt}`;
if (!/^[a-z0-9-]+$/.test(attempt ?? '') || !/^tests\/visual\/[a-z-]+\/[a-z-]+\.mjs$/.test(input ?? '') || fs.existsSync(output)) throw Error('Unique attempt and owned existing harness required');
fs.mkdirSync(output, { recursive: true });
const ownershipBefore = { immutable: immutableInputs(), assets: { ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() } };
fs.writeFileSync(`${output}/ownership-before.json`, `${JSON.stringify(ownershipBefore, null, 2)}\n`, { flag: 'wx' });
checkSource();
const original = fs.readFileSync(input, 'utf8');
fs.writeFileSync(`${output}/original-harness.mjs`, original, { flag: 'wx' });
fs.copyFileSync(import.meta.filename, `${output}/executed-runner.mjs`);
const remapped = [];
let adapted = original.replace(/\b(from\s+|import\s*\(\s*)(['"])(\.{1,2}\/[^'"\n]+)\2/g, (whole, prefix, quote, reference) => {
 const resolved = pathToFileURL(path.resolve(path.dirname(input), reference)).href;
 remapped.push({ reference, resolved }); return `${prefix}${quote}${resolved}${quote}`;
}).replaceAll('docs/poc/evidence/', `${output}/legacy/`).replaceAll('test-results/', `${output}/legacy-captures/`);
const assertionUpdates = [];
const replaceAssertion = (before, after, reason) => { assert.equal(adapted.split(before).length - 1, 1); adapted = adapted.replace(before, after); assertionUpdates.push({ before, after, reason }); };
if (input === 'tests/visual/projects/interactions.mjs') {
 replaceAssertion('[data-project-files-pending]', '[data-project-files]', 'Files is implemented; retain exact owned body count rather than the historical pending-slot selector');
 replaceAssertion('five reused task renderers and Files pending slot', 'five reused task renderers and implemented Files body', 'Update probe label to the actual maintained assertion');
 replaceAssertion('assert.ok(first.length>=2)', 'assert.equal(first.length,0)', 'Original Source startup has no route FX; current canonical cold Project entry must have zero entrance owners, while the subsequent actual List/Activity tab motion assertions remain');
 replaceAssertion("assert.equal(before,'route')", 'assert.equal(before,null)', 'Cold canonical entry has no route transition to consume; retain each actual edit/share/menu/save native action and no-replay assertion');
 replaceAssertion("assert.equal(await host.getAttribute('data-project-transition'),'route')", "assert.equal(await host.getAttribute('data-project-transition'),null)", 'Header and Overview status menus start from matched Source cold/no-FX entry; all native menu/no-replay checks remain');
}
if (input === 'tests/visual/shell/routes.mjs') {
 replaceAssertion("timeline:'[data-timeline-page]'};await expect(p.locator(regression&&owned[page]", "timeline:'[data-timeline-page]',inbox:'[data-inbox-page]',notifications:'[data-notifications-page]',search:'[data-search-page]',members:'[data-members-page]',teams:'[data-teams-page]',activity:'[data-workspace-activity]',archive:'[data-archive-page]'};await expect(p.locator(regression&&owned[page]", 'Retain all 15 canonical route body count assertions using current completed feature owners');
 replaceAssertion("timeline:'[data-timeline-page]'};await expect(p.locator(regression&&owned[view]", "timeline:'[data-timeline-page]',files:'[data-project-files]'};await expect(p.locator(regression&&owned[view]", 'Retain all eight fixed Project tab body assertions including completed Files');
}
if (input === 'tests/visual/task-list/interactions.mjs') replaceAssertion("assert.equal(await page.locator('[draggable=true]').count(),0)", "assert.equal(await page.locator('[data-list-scope=mine] [draggable=true]').count(),0)", 'My Tasks prohibits task-row drag; current canonical Sidebar project reorder links remain legitimately draggable and are outside this owner');
if (input === 'tests/visual/task-collaboration/interactions.mjs') replaceAssertion("await page.getByLabel('Date YYYY-MM-DD').fill('2026-10-10');await page.getByRole('button',{name:'Apply',exact:true}).click();", "await page.getByRole('button',{name:'2026-10-10',exact:true}).click();", 'Use the current Source-aligned native date-calendar day control; retain the exact canonical child dueDate assertion and all subsequent child interactions');
const adapter = `${output}/executed-adapter.mjs`;
fs.writeFileSync(adapter, adapted, { flag: 'wx' });
const argv = [process.execPath, adapter, 'replay', '--attempt=replay', ...process.argv.slice(4)];
fs.writeFileSync(`${output}/adapter-provenance.json`, `${JSON.stringify({ input, inputBytes: Buffer.byteLength(original), inputSha256: sha256(Buffer.from(original)), adapter, adapterBytes: Buffer.byteLength(adapted), adapterSha256: sha256(Buffer.from(adapted)), remapped, assertionUpdates, changes: ['Resolve relative module imports to the original owner modules', 'Redirect all evidence and test-results namespaces into this unique WU-29 attempt', ...assertionUpdates.map(update => update.reason)], scope: 'Replay maintained native assertions against the current built application; exact completed-owner selector substitutions are listed above. Original entry routes and harness limitations remain; this replay alone does not establish inventory-wide action acceptance.', argv }, null, 2)}\n`, { flag: 'wx' });
const command = `${argv.map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ')}\n`;
fs.writeFileSync(`${output}/command.txt`, command, { flag: 'wx' });
const out = fs.openSync(`${output}/stdout`, 'wx'), err = fs.openSync(`${output}/stderr`, 'wx'), startedAt = new Date().toISOString();
const result = spawnSync(argv[0], argv.slice(1), { stdio: ['ignore', out, err] }); fs.closeSync(out); fs.closeSync(err);
const record = file => { const bytes = fs.readFileSync(file); return { path: file, bytes: bytes.length, sha256: sha256(bytes) }; };
const execution = { argv, command: record(`${output}/command.txt`), startedAt, finishedAt: new Date().toISOString(), exitStatus: result.status, signal: result.signal, error: result.error?.code ?? null, stdout: record(`${output}/stdout`), stderr: record(`${output}/stderr`) };
fs.writeFileSync(`${output}/execution.json`, `${JSON.stringify(execution, null, 2)}\n`, { flag: 'wx' });
const ownershipAfter = { immutable: immutableInputs(), assets: { ...implementationAssets(), ...httpBuildAssets(), ...sourceAssets() } };
fs.writeFileSync(`${output}/ownership-after.json`, `${JSON.stringify(ownershipAfter, null, 2)}\n`, { flag: 'wx' });
checkSource(); assert.deepEqual(ownershipBefore, ownershipAfter);
console.log(JSON.stringify({ attempt, input, exitStatus: result.status, stdout: execution.stdout.bytes, stderr: execution.stderr.bytes }));
assert.equal(result.status, 0, 'Native replay failed; original raw files retained');
