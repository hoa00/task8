import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSeedFixture, seedProvenance } from '../src/db/fixture.ts';
import { sourceId } from '@studio/contracts/source-identities';

export function seedRows() {
  const fixtureBytes = readFileSync(new URL('../../../docs/poc/reference/source-fixture.json', import.meta.url));
  if (createHash('sha256').update(fixtureBytes).digest('hex') !== seedProvenance.fixtureSha256) throw new Error('Locked fixture drift');
  const data = createSeedFixture(), at = Date.parse(seedProvenance.clock), wid = data.workspaceId, actor = data.currentMemberId;
  const rows = {};
  const put = (table, row) => (rows[table] ??= []).push(row);
  const timestamps = { createdAt: at, updatedAt: at };
  const epoch = value => value === null ? null : Date.parse(value);
  const json = JSON.stringify;
  put('workspaces', { ...data.workspaces[wid], ...timestamps, brand: +data.workspaces[wid].brand });
  for (const u of Object.values(data.users)) { const { email, ...profile } = u; put('users',{ ...profile, displayEmail: email, emailNormalized: email.toLowerCase(), ...timestamps }); }
  for (const t of Object.values(data.teams)) { const { memberIds, ...team } = t; void memberIds; put('teams',{ ...team, ...timestamps, nameNormalized: t.name.trim().toLowerCase() }); }
  for (const m of Object.values(data.members)) { const { name,email,title,avatarColor,timezone,...member } = m; void [name,email,title,avatarColor,timezone]; put('workspaceMembers',{...member, ...timestamps, lastSeenAt:epoch(m.lastSeenAt)}); put('memberPreferences',{workspaceId:wid,memberId:m.id,preferencesJson:json(data.preferences),notificationPreferencesJson:json(data.notificationPreferences),updatedAt:at}); }
  for (const p of Object.values(data.projects)) {
    const { memberIds,milestones,isFavorite,...project }=p;
    const numbers=Object.values(data.tasks).filter(t=>t.projectId===p.id).map(t=>Number(t.key.split('-').at(-1)));
    put('projects',{...project,createdAt:epoch(p.createdAt),updatedAt:epoch(p.updatedAt),lastActivityAt:epoch(p.lastActivityAt),archivedAt:epoch(p.archivedAt),taskSequence:Math.max(200,...numbers)});
    for (const memberId of memberIds) put('projectMembers',{workspaceId:wid,projectId:p.id,memberId,permission:'edit'});
    for (const milestone of milestones) put('projectMilestones',milestone);
    if (isFavorite) put('projectFavorites',{workspaceId:wid,memberId:actor,projectId:p.id,createdAt:at});
  }
  for (const t of Object.values(data.tasks)) {
    const { key,labelIds,dependencyIds,isFavorite,subtaskSummary,attachmentCount,commentCount,...task }=t; void [subtaskSummary,attachmentCount,commentCount];
    // Same normalized text as Mock seed; source position*100 is preserved (DATA_MODEL's1024 sketch differs).
    const { normalizeDescription } = domain;
    put('tasks',{...task,number:Number(key.split('-').at(-1)),descriptionText:normalizeDescription(t.descriptionHtml).text,createdBy:actor,createdAt:epoch(t.createdAt),updatedAt:epoch(t.updatedAt),completedAt:epoch(t.completedAt),archivedAt:epoch(t.archivedAt)});
    for (const labelId of labelIds) put('taskLabels',{workspaceId:wid,taskId:t.id,labelId});
    for (const dependsOnTaskId of dependencyIds) put('taskDependencies',{workspaceId:wid,taskId:t.id,dependsOnTaskId});
    if(isFavorite)put('taskFavorites',{workspaceId:wid,memberId:actor,taskId:t.id,createdAt:at});
  }
  for(const s of Object.values(data.subtasks))put('subtasks',{...s,workspaceId:wid,...timestamps,done:+s.done});
  for(const c of Object.values(data.comments)){
    const {mentionedMemberIds,reactions,...comment}=c;
    put('comments',{...comment,updatedAt:epoch(c.createdAt),createdAt:epoch(c.createdAt),mentionedMemberIdsJson:json(mentionedMemberIds)});
    for(const r of reactions)for(const memberId of r.memberIds)put('commentReactions',{workspaceId:wid,commentId:c.id,memberId,reactionKey:r.key,createdAt:epoch(c.createdAt)});
  }
  for(const a of Object.values(data.activity)){const {payload,...activity}=a;put('activity',{...activity,workspaceId:wid,createdAt:epoch(a.createdAt),payloadJson:json(payload)});}
  for(const n of Object.values(data.notifications))put('notifications',{...n,createdAt:epoch(n.createdAt),readAt:epoch(n.readAt)});
  for(const f of Object.values(data.files)){const {contentAvailable,...file}=f;void contentAvailable;put('files',{...file,createdAt:epoch(f.createdAt),updatedAt:epoch(f.createdAt)});}
  for(const e of Object.values(data.events))put('calendarEvents',e);
  for(const v of Object.values(data.savedViews)){const {filters,...view}=v;put('savedViews',{...view,...timestamps,filtersJson:json(filters)});}
  data.projectOrder.forEach((projectId,i)=>put('memberProjectOrder',{workspaceId:wid,memberId:actor,projectId,position:i*100}));
  // Finite test-only second scope: same normalized rows/relationships, disjoint UUIDv7 identities.
  const idMap = new Map(Object.values(rows).flatMap(rs=>rs.flatMap(r=>Object.values(r).filter(v=>typeof v==='string' && /^[0-9a-f-]{36}$/.test(v)))).map(id=>[id,secondaryId(id)]));
  idMap.set(wid,sourceId('workspaces','w2'));
  const rewrite=v=>typeof v==='string' ? idMap.get(v) ?? v : v;
  const secondary={};
  for(const [table,rs] of Object.entries(rows))secondary[table]=rs.map(r=>Object.fromEntries(Object.entries(r).map(([key,v])=>[key,key.endsWith('Json') ? json(rewriteJson(JSON.parse(v),rewrite)) : rewrite(v)])));
  secondary.workspaces[0]={...secondary.workspaces[0],...data.workspaces[sourceId('workspaces','w2')],createdAt:at,updatedAt:at,brand:0};
  for(const u of secondary.users){u.emailNormalized='isolation+'+u.emailNormalized;u.displayEmail='isolation+'+u.displayEmail;}
  return {rows,secondary,primary:{workspaceId:wid,memberId:actor,userId:data.members[actor].userId},isolation:{workspaceId:idMap.get(wid),memberId:idMap.get(actor),userId:idMap.get(data.members[actor].userId)},provenance:seedProvenance};
}
import * as domain from '@studio/domain';
function rewriteJson(v,rewrite){return Array.isArray(v)?v.map(x=>rewriteJson(x,rewrite)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rewriteJson(x,rewrite)])):rewrite(v);}
export function secondaryId(id){const h=createHash('sha256').update('task8:wu30:isolation:'+id).digest('hex');return `01a11abd-aa80-7${h.slice(0,3)}-8${h.slice(3,6)}-${h.slice(6,18)}`;}
const tableOrder=['workspaces','users','teams','workspaceMembers','projects','projectMembers','projectMilestones','tasks','subtasks','taskLabels','taskDependencies','comments','commentReactions','files','activity','notifications','calendarEvents','savedViews','memberPreferences','taskFavorites','projectFavorites','memberProjectOrder'];
// CLI seed uses a finite generated SQL file; production queries always use bound prepared statements.
const literal=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
export function seedSql(seed=seedRows()) {return tableOrder.flatMap(table=>[...seed.rows[table]??[],...seed.secondary[table]??[]].map(row=>`INSERT INTO "${table}" (${Object.keys(row).map(k=>'"'+k+'"').join(',')}) VALUES (${Object.values(row).map(literal).join(',')}) ON CONFLICT DO NOTHING;`)).join('\n')+'\n';}
