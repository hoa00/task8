export async function sourceBoard(page,sample,identities) {
 await page.waitForFunction(()=>window.__gr8r);
 return page.evaluate(async({sample,identities})=>{
 const {D,S,tasksOf}=await import('/src/core/store.js'),{pageTasks}=await import('/src/pages/tasks.js'),{boardHtml}=await import('/src/views/board.js'),{applyView,viewToolbar}=await import('/src/shell/view-engine.js');
 const lookup=Object.fromEntries(identities.filter(row=>row.collection==='tasks').map(row=>[row.sourceId,row.id]));D().tasks.sort((a,b)=>lookup[a.id].localeCompare(lookup[b.id]));
 const composerTask=D().tasks.find(task=>task.status==='backlog'&&(sample.scope==='workspace'||task.project==='p1'));
 const key=sample.scope==='workspace'?'tasks':sample.scope==='saved'?'sv:v1':'p:p1',view={filters:[],q:sample.state==='no-results'?'no matching board WU12':sample.state==='composer'?composerTask.key:'',sort:{f:'manual',dir:1},group:'status',hidden:['start','created','deps'],colW:{},mode:'board',showDone:true};
 S.views[key]=view;S.ui.collapsedCols={};S.ui.composer=null;S.ui.fx={};S.ui.pop=null;
 if(sample.state==='collapsed')S.ui.collapsedCols[key+':todo']=true;
 if(sample.state==='composer')S.ui.composer={ctx:key,group:'backlog',gb:{status:'backlog'}};
 if(sample.canonical){S.ui.route='tasks';S.ui.params={};S.ui.collapsed=false;await import('/src/shell/render.js').then(({render})=>render());return{key,q:view.q};}
 const section=document.createElement('section');section.id='source-board';section.style.height='100%';section.style.display='block';section.style.flexDirection='column';
 section.innerHTML=sample.scope==='workspace'?pageTasks():'<div class="page flush">'+viewToolbar(key,{group:false})+boardHtml(applyView(tasksOf('p1'),view),key,{project:'p1'})+'</div>';
 let host=document.getElementById('source-board-hidden-host');if(!host){host=document.createElement('div');host.id='source-board-hidden-host';host.hidden=true;host.append(...document.body.childNodes);}document.body.append(section,host);
 let composerFocus=null;if(sample.state==='composer'){const body=section.querySelector('.bcol-b'),before=body.scrollTop;await new Promise(resolve=>setTimeout(()=>{section.querySelector('#composer-in').focus();resolve();},0));composerFocus={sourceBefore:before,sourceAfter:body.scrollTop};}
 return{key,q:view.q,composerFocus,hosts:{app:document.getElementById('app').isConnected,layer:document.getElementById('layer').isConnected}};
 },{sample,identities});
}
