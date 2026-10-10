export async function sourceDetail(page, sample) {
 return page.evaluate(async sample => {
  const {S,D}=await import('/src/core/store.js'),{renderLayer}=await import('/src/overlays/drawer.js'),{filePrev}=await import('/src/ui/helpers.js'),{A}=await import('/src/actions/actions.js'),{render}=await import('/src/shell/render.js');
  for(const family of ['Geist','Geist Mono'])for(const weight of [400,500,600])await document.fonts.load(`${weight} 13.5px "${family}"`);await document.fonts.ready;
  S.ui.drawer=null;S.ui.modals=[];S.ui.pop=null;S.ui.fx={};
  // Isolate owned overlays: keep original lifecycle hosts, hide unrelated app paint.
  document.getElementById('app').hidden=true;
  if(!document.getElementById('source-qa-root')){const root=document.createElement('div');root.id='source-qa-root';root.style.height='100%';root.append(document.getElementById('app'),document.getElementById('layer'));document.body.append(root);}
  const task=D().tasks.find(row=>row.id==='t3'),file=task.attachments[0];let attachmentGeometry=null;
  if(sample.kind==='drawer'){document.getElementById('app').hidden=true;S.ui.drawer=task.id;S.ui.drawerFull=!!sample.full;render();}
  if(sample.kind==='form'){if(sample.edit)A.editTask({dataset:{id:task.id}});else A.newTask({dataset:{project:'p1'}});if(sample.state==='filled')Object.assign(S.ui.form,{title:'Prepare launch checklist',desc:'Coordinate the release plan.',subtasks:[{title:'Confirm launch date',done:false}]});if(sample.state==='error')S.ui.errors.title='Give the task a name';S.ui.fx={};render();if(sample.state==='loading'){document.getElementById('f-submit').classList.add('is-loading');for(const input of document.querySelectorAll('.modal form input,.modal form textarea,.modal form button'))input.disabled=true;}}
  if(sample.kind==='preview'){S.ui.modals=[{type:'filePreview',file,tid:task.id}];render();}
  if(sample.kind==='attachment'||sample.kind==='art'){
   // Preserve original lifecycle hosts while isolating this owning component.
   const holder=document.createElement('div');
   const section=document.createElement('section');section.id='source-component';
   if(sample.kind==='art'){section.style.width='300px';section.innerHTML=filePrev({name:`Sample.${sample.ext}`,type:sample.type});}
   else{S.ui.drawer=task.id;S.ui.uploads=sample.state==='uploading'?[{id:'qa-upload',task:task.id,name:'Launch-assets.fig',pct:42}]:[];const old=task.attachments;task.attachments=sample.state==='existing'?old:[];render();await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));render();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const body=document.querySelector('.drawer-b'),bodyRect=body.getBoundingClientRect(),bodyStyle=getComputedStyle(body),actual=document.querySelector(sample.state==='existing'?'.attc':sample.state==='empty'?'.drawer .dropzone':'.drawer .upl').getBoundingClientRect();attachmentGeometry={body:bodyRect.toJSON(),contentWidth:body.clientWidth-parseFloat(bodyStyle.paddingLeft)-parseFloat(bodyStyle.paddingRight),component:actual.toJSON(),inset:parseFloat(bodyStyle.paddingLeft)};const temp=document.createElement('div');temp.innerHTML=renderLayer();const attachments=[...temp.querySelectorAll('.dsec')].find(el=>el.querySelector('h3')?.textContent==='Attachments');section.style.width=`${attachmentGeometry.component.width}px`;section.style.margin=`${attachmentGeometry.inset}px`;section.innerHTML=sample.state==='existing'?attachments.querySelector('.attc').outerHTML:sample.state==='empty'?attachments.querySelector('.dropzone').outerHTML:attachments.querySelector('.upl').outerHTML;task.attachments=old;}
   holder.hidden=true;holder.append(...document.body.childNodes);document.body.append(holder);const root=document.createElement('div');root.id='source-qa-component-root';root.style.height='100%';root.append(section);document.body.append(root,holder);
  }
  return { taskKey:task.key, attachmentGeometry, pendingSections:['richtext editor','subtask detail','Comments/Activity'] };
 },sample);
}

// Isolate the original owned component; the full source renderer and hosts stay intact.
export async function isolateOwnedDrawer(page) {
 return page.evaluate(() => {
  const original=document.querySelector('.drawer'),body=original.querySelector('.drawer-b'),grid=body.querySelector('.kv'),cutoff=Math.ceil(grid.getBoundingClientRect().bottom-original.getBoundingClientRect().top+20)+original.getBoundingClientRect().top;
  const children=[...body.children],index=children.indexOf(grid),omitted=children.slice(index+1).map(el=>({tag:el.tagName,class:el.className,heading:el.querySelector('h3')?.textContent,rect:el.getBoundingClientRect().toJSON()}));
  if(omitted.some(el=>el.rect.top<cutoff))throw Error('An omitted section intersects the owned clip');
  const clone=original.cloneNode(true),clonedBody=clone.querySelector('.drawer-b');[...clonedBody.children].slice(index+1).forEach(el=>el.remove());
  const exactChromeMarkup=clone.querySelector('.drawer-h').outerHTML===original.querySelector('.drawer-h').outerHTML&&clone.querySelector('h2').outerHTML===original.querySelector('h2').outerHTML;
  const exactOwnedMarkup=[...clonedBody.children].map(el=>el.outerHTML).every((html,i)=>html===children[i].outerHTML);
  const layer=document.getElementById('layer');layer.hidden=true;
  const component=document.createElement('div');component.id='source-owned-drawer';const scrim=layer.querySelector('.drawer-scrim');if(scrim)component.append(scrim.cloneNode(true));component.append(clone);document.getElementById('source-qa-root').prepend(component);
  return{cutoff,omitted,exactOwnedMarkup,exactChromeMarkup,sourceHostsConnected:document.getElementById('app').isConnected&&layer.isConnected,scope:'Original chrome/title/properties only; omitted original sections lie entirely outside the accepted clip'};
 });
}
