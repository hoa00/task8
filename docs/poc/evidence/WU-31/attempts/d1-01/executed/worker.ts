// Test-only local entry. Production src/index.ts never imports this file.
import app from '../../src/index.ts';
export default {async fetch(request:Request,env:CloudflareBindings,context:ExecutionContext) {
  const path=new URL(request.url).pathname;
  if(path==='/__wu31/sql') {const input=await request.json() as {sql:string;parameters?: (string|number|null)[]};return Response.json(await env.DB.prepare(input.sql).bind(...(input.parameters??[])).all());}
  if(path==='/__wu31/snapshot') {
    const tables=['users','workspaces','workspaceMembers','teams','projects','projectMembers','tasks','subtasks','taskLabels','taskDependencies','activity','commandUndoRecords'];const rows:Record<string,unknown>={};for(const table of tables)rows[table]=(await env.DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all().catch(async()=>env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).results;
    return Response.json({now:Date.now(),rows});
  }
  const injection=request.headers.get('x-wu31-test');
  if(!injection)return app.fetch(request,env,context);
  // Interpose at the real D1 batch boundary after all production preflight reads.
  let injected=false;
  const binding=new Proxy(env.DB,{get(target,key) {
    if(key==='batch')return async(statements:D1PreparedStatement[])=>{
      if(!injected) {
        injected=true;
        if(injection==='fail')statements.splice(1,0,target.prepare("INSERT INTO workspaceMembers(id,workspaceId,userId,role,status,createdAt,updatedAt,version) VALUES ('missing-fk','missing','missing','Member','active',0,0,1)"));
        else {const change=JSON.parse(injection) as {sql:string;parameters?: (string|number|null)[]};await target.prepare(change.sql).bind(...(change.parameters??[])).run();}
      }
      return target.batch(statements);
    };
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  return app.fetch(request,{...env,DB:binding},context);
}};
