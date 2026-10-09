import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { artifacts, checkSource, sha256 } from '../reference/source-check.mjs';
const root = 'docs/poc/evidence/WU-18', primary = 'matrix-04', supplement = 'qualified-activity-project-01';
const read = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const files = [primary, supplement].map(attempt => `${root}/attempts/${attempt}/report.json`), reports = files.map(read);
const pairs = [];
const currentInputs = Object.fromEntries(['baseline-manifest.json','font-assets.json','source-fixture.json','source-lock.json'].map(name => [name, sha256(fs.readFileSync(`${artifacts}/${name}`))]));
const names = execFileSync('git', ['ls-files','--cached','--others','--exclude-standard','--','apps/web/src','packages','apps/web/vite.config.ts','package.json','pnpm-lock.yaml'], {encoding:'utf8'}).trim().split('\n').filter(Boolean);
function walk(dir) { for (const file of fs.readdirSync(dir, {withFileTypes:true})) { const name = `${dir}/${file.name}`; if (file.isDirectory()) walk(name); else names.push(name); } }
walk('apps/web/dist');
const currentAssets = Object.fromEntries([...new Set(names)].sort().map(name => [name,sha256(fs.readFileSync(name))]));
for (const [index, report] of reports.entries()) {
 assert.equal(report.threshold, 0); assert.equal(report.includeAA, true); assert.equal(report.maxDiffPixels, 0); assert.deepEqual(report.masks, []);
 assert.deepEqual(report.immutableBefore, currentInputs); assert.deepEqual(report.implementationAssetsBefore, currentAssets);
 assert.equal(report.runtime.profile.name, 'matched-full-raster-linux-WU18'); assert.equal(report.runtime.profile.appliesTo, 'Both Source and Target'); assert.equal(report.runtime.profile.actualLaunchArguments.filter(arg => arg === '--disable-partial-raster').length, 1);
 assert.equal(report.sourceSha, '904205c626918ee96054eb35495c394a60c0c601');
 const freeze = read(`${root}/${index === 0 ? primary : supplement}-freeze.json`);
 for (const [file, hash] of Object.entries(freeze.files)) assert.equal(sha256(fs.readFileSync(file)), hash, file);
 const selected = index === 0 ? report.samples.filter(row => !['activity','project-feed'].includes(row.sample.surface)) : report.samples;
 assert.equal(selected.length, index === 0 ? 34 : 11);
 if (index === 0) { assert.equal(report.status, 'failed'); assert.match(report.error, /getByRole\('tab'/); }
 else { assert.equal(report.status, 'passed'); assert.deepEqual(report.immutableAfter, currentInputs); assert.deepEqual(report.implementationAssetsAfter, currentAssets); }
 for (const row of selected) {
  assert.equal(row.changedPixels, 0, row.id); assert.equal(row.repeatabilityPixels, 0, row.id); assert.equal(row.geometryEqual, true, row.id);
  assert.equal(row.fixtureProjection.kind, row.sample.surface === 'activity' ? 'ExplicitCanonicalActivityOrderLayoutOnly' : 'OriginalSourceFixture'); assert.equal(row.fixtureProjection.unchangedRecords, true);
  const images = [['source','sourceSha256'],['target','targetSha256'],['source-repeat','sourceRepeatSha256'],['target-repeat','targetRepeatSha256']].map(([side,key]) => { const path = `${report.output}/${row.id}-${side}.png`, bytes = fs.readFileSync(path); assert.equal(sha256(bytes),row[key]); return { path,sha256:row[key],png:PNG.sync.read(bytes) }; });
  const compare = (a,b) => { assert.equal(a.width,b.width); assert.equal(a.height,b.height); return pixelmatch(a.data,b.data,null,a.width,a.height,{threshold:0,includeAA:true}); };
  assert.equal(compare(images[0].png,images[1].png),0); assert.equal(compare(images[0].png,images[2].png),0); assert.equal(compare(images[1].png,images[3].png),0);
  pairs.push({ id:row.id,sample:row.sample,report:files[index],reportSha256:sha256(fs.readFileSync(files[index])),fixtureProjection:row.fixtureProjection,clip:row.clip,changedPixels:0,repeatabilityPixels:0,images:images.map(({path,sha256})=>({path,sha256})) });
 }
}
assert.equal(new Set(pairs.map(row=>row.id)).size,45); assert.equal(pairs.length,45);
for (const [surface,count] of [['activity',9],['search',15],['palette',13],['shortcuts',2],['file-preview',2],['home-feed',2],['project-feed',2]]) assert.equal(pairs.filter(row=>row.sample.surface===surface).length,count,surface);
checkSource();
const output = `${root}/visual-verification.json`; assert.equal(fs.existsSync(output),false,'Never overwrite executed aggregate');
fs.writeFileSync(output,JSON.stringify({status:'passed',technicalReview:'AwaitingRootRuntimeScopeReview',profileAdopted:false,scope:'Qualified WU18 content/overlay only; matched Source+Target Linux Chromium145 full raster. Activity9 uses explicit deterministic canonical-order local-copy layout scope; raw original-order mismatch remains unaccepted.',rawPrimaryStatus:'failed; omitted canonical flag plus native Source Project locator timeout; original bytes unchanged',qualifiedPairCount:45,originalAndRepeatPngCount:180,pairs,currentInputs,currentAssets,runtime:reports[1].runtime,sourceSha:reports[1].sourceSha,limits:['No default/Darwin/fullshell/device/user approval.','Inherited WU29 debts and current original Source Activity order correction remain.','Root technical PASS required before DONE/commit/push.']},null,2)+'\n');
console.log(JSON.stringify({status:'passed',pairs:pairs.length,pngCount:180,strictPixels:0,repeatabilityPixels:0,rootReview:'pending'}));
