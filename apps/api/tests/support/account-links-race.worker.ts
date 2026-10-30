import { applyLink, inspectLink, revokeLink, lookupLinkReceipt, AccountLinkError } from "../../src/modules/auth/persistence/account-links.ts";
import type {LinkTarget, LinkCommand, LinkReceipt} from "../../src/modules/auth/domain/account-links.ts";
import {RequestRepository} from '../../src/db/client.ts';
import type {SqlValue} from '../../src/db/client.ts';
import {newId} from '../../src/shared/ids.ts';
function makeRepository(database:D1Database){return new RequestRepository(database);}
function scheduledRepository(database:D1Database,afterRead:(sql:string)=>Promise<void>){
  class ScheduledRepository extends RequestRepository {
    override async all<T>(sql:string,values:readonly SqlValue[]=[]):Promise<T[]>{const observed=await super.all<T>(sql,values);await afterRead(sql);return observed;}
  }
  return new ScheduledRepository(database);
}
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))), byte=>byte.toString(16).padStart(2,"0")).join("");
async function snapshot(database: D1Database) {
  const tables=(await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all<{name:string}>()).results;
  const result: Record<string,{rows:number;sha256:string}>={};
  for(const {name} of tables){if(!/^[A-Za-z0-9_]+$/u.test(name))throw new Error("FIXTURE_TABLE_INVALID");const rows=(await database.prepare('SELECT * FROM "'+name+'"').all()).results;result[name]={rows:rows.length,sha256:await hash(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort()))};}
  return result;
}
export default {
  async fetch(request: Request, env: {DB:D1Database;FIXTURE_KEY:string}) {
    if(request.method!=="POST"||new URL(request.url).pathname!=="/__private_schedule"||request.headers.get("x-fixture-key")!==env.FIXTURE_KEY)return new Response(null,{status:404});
    const scenario:unknown=await request.json();
    if(scenario!=="apply-user-drift"&&scenario!=="apply-current"&&scenario!=="rollback-revision-drift"&&scenario!=="rollback-current")return new Response(null,{status:400});
    const repository=makeRepository(env.DB),user=await env.DB.prepare("SELECT id FROM users ORDER BY id LIMIT 1").first<{id:string}>();
    if(!user)throw new Error("POPULATED_FIXTURE_REQUIRED");
    const target:LinkTarget={localUserId:user.id,source:{kind:"existing-local-user",localUserId:user.id},expectedLink:"absent-or-identical",verifyOnlyMemberships:[]};
    const issuer="https://identity-service.demo/api/auth",subject="Fixture/Scheduled/"+scenario;
    const command:LinkCommand={manifestId:"scheduled-"+scenario,manifestDigest:"a".repeat(64),entryId:"person",issuer,subject,target,snapshot:await inspectLink(repository,issuer,subject,target),actor:"fixture-operator",correlation:"scheduled-native",candidateId:newId(),marker:newId(),now:Date.now()};
    let scheduled=false,winner:LinkReceipt|null=null,winnerState:Awaited<ReturnType<typeof snapshot>>|null=null;
    const isApply=scenario.startsWith("apply"),drift=scenario.endsWith("drift");
    const receipt=isApply?null:await applyLink(repository,command);
    const context={actor:"fixture-operator",correlation:"scheduled-rollback",marker:newId(),now:Date.now(),kind:"rollback" as const};
    const afterRead=async()=>{
      if(scheduled)return;
      scheduled=true;
      if(isApply){winner=await applyLink(makeRepository(env.DB),{...command,candidateId:newId(),marker:newId()});if(drift)await env.DB.prepare("UPDATE users SET version=version+1 WHERE id=?").bind(user.id).run();}
      else {if(!receipt)throw new Error("RECEIPT_REQUIRED");winner=await revokeLink(makeRepository(env.DB),receipt,{...context,marker:newId()});if(drift)await env.DB.prepare("UPDATE oidcIdentityLinks SET revision=revision+1 WHERE id=?").bind(receipt.linkId).run();}
      winnerState=await snapshot(env.DB);
    };
    const delayed=scheduledRepository(env.DB,async(sql:string)=>{if(sql.includes("FROM oidcLinkOperations"))await afterRead();});
    let actual:LinkReceipt|null=null,code:string|null=null;
    try{actual=isApply?await applyLink(delayed,command):await revokeLink(delayed,receiptRequired(receipt),context);}catch(error){code=error instanceof AccountLinkError?error.code:"UNEXPECTED_NATIVE_FAILURE";}
    const after=await snapshot(env.DB),lookup=isApply?await lookupLinkReceipt(makeRepository(env.DB),command):null;
    const current=await env.DB.prepare("SELECT revision,status FROM oidcIdentityLinks WHERE issuer=? AND subject=?").bind(issuer,subject).first<{revision:number;status:string}>();
    return Response.json({scenario,scheduled,concurrentWinnerCommitted:winner!==null,returnedSuccess:actual!==null,code,canonicalEqual:actual!==null&&JSON.stringify(actual)===JSON.stringify(winner),zeroDelayedEffects:JSON.stringify(winnerState)===JSON.stringify(after),lookup:isApply?(lookup===null?"null":"current-receipt"):"not-applicable",current,beforeDelayed:winnerState,afterDelayed:after});
  },
};
function receiptRequired(receipt:LinkReceipt|null){if(!receipt)throw new Error("RECEIPT_REQUIRED");return receipt;}
