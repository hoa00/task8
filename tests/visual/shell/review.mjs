import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {sha256} from '../reference/source-check.mjs';
const evidence=path.resolve('docs/poc/evidence/WU-07'),output=path.resolve('test-results/WU-07'),accepted=path.join(evidence,'linux-samples'),review=path.join(evidence,'review');fs.mkdirSync(accepted,{recursive:true});fs.mkdirSync(review,{recursive:true});
const report=JSON.parse(fs.readFileSync(`${evidence}/visual-verification.json`,'utf8'));assert.equal(report.status,'passed');
for(const sample of report.samples)for(const side of ['source','target']){const bytes=fs.readFileSync(`${output}/${sample.id}-${side}.png`);assert.equal(sha256(bytes),sample[`${side}Sha256`]);fs.writeFileSync(`${accepted}/${sample.id}-${side}.png`,bytes);}
const sheets=[];
for(const region of ['sidebar','topbar','bottomnav']){
 const samples=report.samples.filter(sample=>sample.id.endsWith(region)),images=samples.map(sample=>PNG.sync.read(fs.readFileSync(`${accepted}/${sample.id}-source.png`)));const columns=region==='sidebar'?4:1,rows=Math.ceil(images.length/columns),cellWidth=Math.max(...images.map(png=>png.width))+12,cellHeight=Math.max(...images.map(png=>png.height))+12;
 const canvas=new PNG({width:cellWidth*columns,height:cellHeight*rows});canvas.data.fill(255);
 images.forEach((png,index)=>{const x=index%columns*cellWidth,y=Math.floor(index/columns)*cellHeight;PNG.bitblt(png,canvas,0,0,png.width,png.height,x,y);});
 const filename=`source-${region}-sheet.png`;fs.writeFileSync(`${review}/${filename}`,PNG.sync.write(canvas));sheets.push({path:`docs/poc/evidence/WU-07/review/${filename}`,ids:samples.map(sample=>sample.id),composition:'Source-only original PNG bytes placed without scaling, labels, masking or image content changes.'});
}
fs.writeFileSync(`${review}/sheets.json`,JSON.stringify({sourceSha:report.sourceSha,samples:report.samples.length,acceptedPngCount:report.samples.length*2,sheets},null,2)+'\n');console.log(JSON.stringify({samples:report.samples.length,copiedPngCount:report.samples.length*2,sheets:sheets.length}));
