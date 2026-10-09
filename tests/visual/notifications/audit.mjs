import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../reference/source-check.mjs';
const root = 'docs/poc/evidence/WU-19', name = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
if (!name || !/^[a-z0-9-]+\.json$/.test(name)) throw Error('Unique scoped output required');
const output = `${root}/${name}`; if (fs.existsSync(output)) throw Error('Never overwrite audit');
const manifests = fs.readdirSync(root).filter(name => name.endsWith('-freeze.json')).sort(), files = new Map();
for (const manifest of manifests) for (const [path, expected] of Object.entries(JSON.parse(fs.readFileSync(`${root}/${manifest}`)).files)) { if (files.has(path)) assert.equal(files.get(path), expected); files.set(path, expected); }
for (const [path, expected] of files) { assert.equal(sha256(fs.readFileSync(path)), expected, path); if (process.argv.includes('--index')) assert.equal(sha256(execFileSync('git', ['show', `:${path}`], { maxBuffer: 64 * 1024 * 1024 })), expected, `Git index ${path}`); }
const report = { status: 'passed', manifests: manifests.map(name => `${root}/${name}`), manifestCount: manifests.length, frozenFiles: files.size, frozenPng: [...files.keys()].filter(name => name.endsWith('.png')).length, worktreeBytesVerified: true, gitIndexBytesVerified: process.argv.includes('--index'), files: Object.fromEntries(files) };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ manifests: report.manifestCount, files: report.frozenFiles, png: report.frozenPng, gitIndex: report.gitIndexBytesVerified }));
