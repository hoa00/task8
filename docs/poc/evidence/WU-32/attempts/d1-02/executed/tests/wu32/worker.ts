// Test-only local entry. Production src/index.ts never imports this file.
import app from '../../src/index.ts';
export default {async fetch(request:Request,env:CloudflareBindings,context:ExecutionContext) {
  const path=new URL(request.url).pathname;
  if(path==='/__wu32/sql') {const input=await request.json() as {sql:string;parameters?: (string|number|null)[]};return Response.json(await env.DB.prepare(input.sql).bind(...(input.parameters??[])).all());}
  if(path==='/__wu32/snapshot') {
    const tables=['users','workspaces','workspaceMembers','teams','projects','projectMembers','tasks','subtasks','taskLabels','taskDependencies','comments','commentReactions','files','activity','notifications','savedViews','taskFavorites','projectFavorites','memberProjectOrder','memberPreferences','calendarEvents','projectMilestones','commandUndoRecords','d1_migrations'];const rows:Record<string,unknown>={};for(const table of tables)rows[table]=(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
    return Response.json({now:Date.now(),rows});
  }
  const injection=request.headers.get('x-wu32-test');
  // Interpose at the real D1 batch boundary after all production preflight reads.
  let injected=false,queries=0,maximumParameters=0;
  const binding=new Proxy(env.DB,{get(target,key) {
    if(key==='prepare')return (sql:string)=>{queries++;const statement=target.prepare(sql);return new Proxy(statement,{get(prepared,field){if(field==='bind')return (...parameters:unknown[])=>{maximumParameters=Math.max(maximumParameters,parameters.length);return prepared.bind(...parameters);};const value=Reflect.get(prepared,field,prepared);return typeof value==='function'?value.bind(prepared):value;}});};
    if(key==='batch')return async(statements:D1PreparedStatement[])=>{
      if(!injected && injection) {
        injected=true;
        if(injection==='fail')statements.splice(1,0,target.prepare("INSERT INTO workspaceMembers(id,workspaceId,userId,role,status,createdAt,updatedAt,version) VALUES ('missing-fk','missing','missing','Member','active',0,0,1)"));
        else {const change=JSON.parse(injection) as {sql:string;parameters?: (string|number|null)[]};await target.prepare(change.sql).bind(...(change.parameters??[])).run();}
      }
      try{return await target.batch(statements);}catch(error){console.error('WU32 D1 batch failure',error);throw error;}
    };
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const response=await app.fetch(request,{...env,DB:binding},context),headers=new Headers(response.headers);headers.set('x-wu32-queries',String(queries));headers.set('x-wu32-parameters',String(maximumParameters));return new Response(response.body,{status:response.status,headers});
}};
