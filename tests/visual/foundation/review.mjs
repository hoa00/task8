import fs from 'node:fs';
import { PNG } from 'pngjs';
import { sha256 } from '../reference/source-check.mjs';
const base='docs/poc/evidence/WU-03';
const report=JSON.parse(fs.readFileSync(`${base}/verification.json`,'utf8'));
if(report.status!=='passed')throw new Error('Only passed source sample evidence can be reviewed');
const records=[];
for(const item of report.samples)for(const owner of ['source','target']) {
  const bytes=fs.readFileSync(`test-results/WU-03/${item.id}-${owner}.png`);
  if(sha256(bytes)!==item[`${owner}Sha256`])throw new Error(`Image drift ${item.id}/${owner}`);
  fs.writeFileSync(`${base}/linux-samples/${owner}/${item.id}.png`,bytes);
}
for(let batch=0;batch<4;batch++) {
  const items=report.samples.slice(batch*6,batch*6+6);
  const sheet=new PNG({width:1140,height:846});sheet.data.fill(255);
  items.forEach((item,index)=>{
    const png=PNG.sync.read(fs.readFileSync(`${base}/linux-samples/source/${item.id}.png`));
    for(let y=0;y<423;y++)for(let x=0;x<380;x++) {
      const src=((Math.min(y*2,png.height-1))*png.width+x*2)*4;
      const dst=((Math.floor(index/3)*423+y)*1140+(index%3)*380+x)*4;
      for(let channel=0;channel<4;channel++)sheet.data[dst+channel]=png.data[src+channel];
    }
  });
  const file=`review/source-sheet-${batch+1}.png`;fs.writeFileSync(`${base}/${file}`,PNG.sync.write(sheet));records.push({file,order:'row-major',samples:items.map(item=>item.id)});
}
for(const id of ['light-indigo-comfortable','dark-rose-compact'])fs.copyFileSync(`test-results/WU-03/${id}-computed.json`,`${base}/${id}-computed.json`);
fs.copyFileSync('test-results/WU-03/light-indigo-comfortable-diff.png',`${base}/review/rejected-edge-diff.png`);
fs.writeFileSync(`${base}/review/sheets.json`,JSON.stringify({sourceOnly:true,sourceSha:report.sourceSha,sheets:records},null,2)+'\n');
console.log(JSON.stringify({sourceImages:24,targetImages:24,sheets:4}));
