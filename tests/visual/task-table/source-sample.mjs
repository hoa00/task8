export async function sourceTable(page, sample, identities) {
 await page.waitForFunction(() => window.__gr8r);
 return page.evaluate(async ({sample, identities}) => {
  const {D,S,tasksOf} = await import('/src/core/store.js'), {pageTasks} = await import('/src/pages/tasks.js'), {tableHtml} = await import('/src/views/table.js'), {applyView,viewToolbar} = await import('/src/shell/view-engine.js');
  const lookup = Object.fromEntries(identities.filter(row=>row.collection==='tasks').map(row=>[row.sourceId,row.id])); D().tasks.sort((a,b)=>lookup[a.id].localeCompare(lookup[b.id]));
  const key = sample.scope==='workspace'?'tasks':sample.scope==='saved'?'sv:v1':'p:p1', task=D().tasks.find(task=>task.key==='WEB-130');
  const view={filters:[],q:sample.state==='empty'?'no matching table WU13':sample.state.startsWith('edit-')?task.key:'',sort:{f:'manual',dir:1},group:sample.group??'status',hidden:['all-columns','scroll'].includes(sample.state)?[]:['start','created','deps'],colW:sample.state==='resized'?{title:400,status:64}: {},mode:'table',showDone:true};
  S.views[key]=view; S.ui.editCell=sample.state.startsWith('edit-')?{id:task.id,f:sample.state.slice(5)}:null; S.ui.fx={}; S.ui.pop=null;
  if(sample.canonical){S.ui.route='tasks';S.ui.params={};S.ui.collapsed=false;await import('/src/shell/render.js').then(({render})=>render());return{key,view};}
  const section=document.createElement('section');section.id='source-table';section.style.height='100%';section.style.display='block';
  section.innerHTML=sample.scope==='workspace'?pageTasks():'<div class="page flush">'+viewToolbar(key,{cols:true})+tableHtml(applyView(tasksOf('p1'),view),key,D().projects.find(project=>project.id==='p1'))+'</div>';
  let host=document.getElementById('source-table-hidden-host');if(!host){host=document.createElement('div');host.id='source-table-hidden-host';host.hidden=true;host.append(...document.body.childNodes);}document.body.append(section,host);
  if(sample.state.startsWith('edit-')) {const input=section.querySelector('#edit-cell');input.focus();input.select();}
  return{key,view,hosts:{app:document.getElementById('app').isConnected,layer:document.getElementById('layer').isConnected}};
 },{sample,identities});
}
