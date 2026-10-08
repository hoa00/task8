import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { sha256 } from '../reference/source-check.mjs';
const base='docs/poc/evidence/WU-05';
const report=JSON.parse(fs.readFileSync(`${base}/verification.json`,'utf8'));
assert.equal(report.status,'passed');assert.equal(report.samples.length,42);
for(const owner of ['source','target'])fs.mkdirSync(`${base}/linux-samples/${owner}`,{recursive:true});
fs.mkdirSync(`${base}/review`,{recursive:true});
for(const sample of report.samples)for(const owner of ['source','target']){
  assert.equal(sample.changedPixels,0);const bytes=fs.readFileSync(`test-results/WU-05/${sample.id}-${owner}.png`);
  assert.equal(sha256(bytes),sample[`${owner}Sha256`]);fs.writeFileSync(`${base}/linux-samples/${owner}/${sample.id}.png`,bytes);
}
const sheets=[];
for(let batch=0;batch<4;batch++){
  const samples=report.samples.slice(batch*12,batch*12+12);const sheet=new PNG({width:1440,height:750});sheet.data.fill(255);
  samples.forEach((sample,index)=>{
    const png=PNG.sync.read(fs.readFileSync(`${base}/linux-samples/source/${sample.id}.png`));
    const width=Math.ceil(png.width/4),height=Math.ceil(png.height/4);assert.ok(width<=360&&height<=250);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const source=(Math.min(y*4,png.height-1)*png.width+Math.min(x*4,png.width-1))*4;
      const target=((Math.floor(index/4)*250+y)*1440+(index%4)*360+x)*4;
      for(let c=0;c<4;c++)sheet.data[target+c]=png.data[source+c];
    }
  });
  const file=`review/source-sheet-${batch+1}.png`;fs.writeFileSync(`${base}/${file}`,PNG.sync.write(sheet));sheets.push({file,order:'row-major',samples:samples.map(sample=>sample.id)});
}
fs.writeFileSync(`${base}/review/sheets.json`,JSON.stringify({sourceOnly:true,sourceSha:report.sourceSha,sheets},null,2)+'\n');
console.log(JSON.stringify({acceptedImages:84,sourceSheets:4}));
