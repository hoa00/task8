import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { sha256 } from '../reference/source-check.mjs';
const base='docs/poc/evidence/WU-04';
const full=JSON.parse(fs.readFileSync(`${base}/initial-full-run.json`,'utf8'));
const choices=JSON.parse(fs.readFileSync(`${base}/choices-verification.json`,'utf8'));
assert.equal(full.status,'passed');assert.equal(full.samples.length,128);assert.equal(full.probes.length,18);
assert.equal(choices.status,'passed');assert.equal(choices.samples.length,20);assert.equal(choices.probes.length,16);
assert.deepEqual(choices.scope,['choices']);assert.deepEqual(choices.immutableAfter,full.immutableAfter);
assert.deepEqual(choices.probes,full.probes.filter(probe=>!probe.id.startsWith('button-heights')));
const replacements=new Map(choices.samples.map(sample=>[sample.id,sample]));
const report={...full,kind:'aggregate-with-scoped-reverification',fullRunAfterLastChange:false,scope:['buttons','fields','choices','display','feedback','select'],samples:full.samples.map(sample=>replacements.get(sample.id)??sample),verificationRuns:[{command:'pnpm visual:controls',report:'initial-full-run.json',samples:128,probes:18,choicesSuperseded:true},{command:'pnpm visual:controls choices',report:'choices-verification.json',samples:20,probes:16,acceptedFinalChoices:true}],lastChange:'Remove invented disabled Tabs/Segmented opacity/cursor from target and source fixture; only Choices and affected interactions rerun.'};
fs.writeFileSync(`${base}/verification.json`,JSON.stringify(report,null,2)+'\n');
for(const owner of ['source','target'])fs.mkdirSync(`${base}/linux-samples/${owner}`,{recursive:true});
for(const sample of report.samples)for(const owner of ['source','target']){
  const bytes=fs.readFileSync(`test-results/WU-04/${sample.id}-${owner}.png`);assert.equal(sha256(bytes),sample[`${owner}Sha256`]);fs.writeFileSync(`${base}/linux-samples/${owner}/${sample.id}.png`,bytes);
}
const sheets=[];
for(let batch=0;batch<8;batch++){
  const samples=report.samples.slice(batch*16,batch*16+16);const sheet=new PNG({width:1604,height:1120});sheet.data.fill(255);
  samples.forEach((sample,index)=>{
    const png=PNG.sync.read(fs.readFileSync(`${base}/linux-samples/source/${sample.id}.png`));
    const width=Math.ceil(png.width/2),height=Math.ceil(png.height/2);assert.ok(width<=401&&height<=280);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const source=((Math.min(y*2,png.height-1))*png.width+Math.min(x*2,png.width-1))*4;
      const target=((Math.floor(index/4)*280+y)*1604+(index%4)*401+x)*4;
      for(let channel=0;channel<4;channel++)sheet.data[target+channel]=png.data[source+channel];
    }
  });
  const file=`review/source-sheet-${batch+1}.png`;fs.writeFileSync(`${base}/${file}`,PNG.sync.write(sheet));sheets.push({file,order:'row-major',samples:samples.map(sample=>sample.id)});
}
fs.writeFileSync(`${base}/review/sheets.json`,JSON.stringify({sourceOnly:true,sourceSha:full.sourceSha,kind:report.kind,sheets},null,2)+'\n');
console.log(JSON.stringify({initialFullSamples:128,initialFullProbes:18,finalChoicesSamples:20,finalChoicesProbes:16,acceptedImages:256,sourceSheets:8}));
