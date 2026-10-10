import { ApiFailure } from '../errors.ts';
import { accessSql } from '../db/guards.ts';
import { exactSet, gatedInsert, matchedBatch } from '../db/commands.ts';
import { projectRow } from './read-model.ts';
import { actorParameters, actorSql, markerSql, newId } from './shared.ts';
import type { EntityId } from '@studio/contracts/api';
import type { RequestRepository, WorkspaceContext } from '../db/repository.ts';
export async function favoriteProject(r:RequestRepository,s:WorkspaceContext,id:EntityId,add:boolean,now:number) {
  await projectRow(r,s,id,true);
  const permitted=`EXISTS (SELECT 1 FROM projects p WHERE p.workspaceId=? AND p.id=? AND p.deletedAt IS NULL AND ${accessSql}) AND ${actorSql()}`;
  const parameters=[s.workspaceId,id,s.memberId,...actorParameters(s)];
  const mutation=add?r.prepare(`INSERT OR IGNORE INTO projectFavorites(workspaceId,memberId,projectId,createdAt) SELECT ?,?,?,? WHERE ${permitted}`,[s.workspaceId,s.memberId,id,now,...parameters]):r.prepare(`DELETE FROM projectFavorites WHERE workspaceId=? AND memberId=? AND projectId=? AND ${permitted}`,[s.workspaceId,s.memberId,id,...parameters]);
  const results=await r.batch([mutation,r.prepare(`SELECT p.id,${actorSql()} authorized,EXISTS (SELECT 1 FROM projectFavorites f WHERE f.workspaceId=p.workspaceId AND f.projectId=p.id AND f.memberId=?) favorite FROM projects p WHERE p.workspaceId=? AND p.id=? AND p.deletedAt IS NULL AND ${accessSql}`,[...actorParameters(s),s.memberId,s.workspaceId,id,s.memberId])]);
  const row=results[1]!.results[0] as {id:string;favorite:number;authorized:number}|undefined;if(!row)throw new ApiFailure('NOT_FOUND','Project not found');
  if(!row.authorized||!!row.favorite!==add)throw new ApiFailure('CONFLICT','Project favorite authorization changed');return {projectId:id,isFavorite:!!row.favorite};
}
export async function projectOrder(r:RequestRepository,s:WorkspaceContext,projectIds:EntityId[]) {
  // Restricted cards are known catalog roots and may be ordered, without exposing
  // their children. Archived/deleted/foreign IDs are never order candidates.
  const catalog=await r.all<{id:string}>('SELECT id FROM projects WHERE workspaceId=? AND archivedAt IS NULL AND deletedAt IS NULL ORDER BY id',[s.workspaceId]);
  if(projectIds.some(id=>!catalog.some(p=>p.id===id)))throw new ApiFailure('VALIDATION_ERROR','Choose known active catalog projects');
  const old=await r.all<{projectId:string;position:number}>('SELECT projectId,position FROM memberProjectOrder WHERE workspaceId=? AND memberId=? ORDER BY position,projectId',[s.workspaceId,s.memberId]);
  const requested=new Set<string>(projectIds),active=new Set(catalog.map(p=>p.id)),rest=[...old.filter(p=>active.has(p.projectId)).map(p=>p.projectId),...catalog.map(p=>p.id)].filter((id,index,all)=>!requested.has(id)&&all.indexOf(id)===index);
  const rows=[...projectIds,...rest].map((projectId,index)=>({workspaceId:s.workspaceId,memberId:s.memberId,projectId,position:index*100}));
  const orders=exactSet('memberProjectOrder','workspaceId=? AND memberId=?',[s.workspaceId,s.memberId],old,['projectId','position']),projects=exactSet('projects','workspaceId=? AND archivedAt IS NULL AND deletedAt IS NULL',[s.workspaceId],catalog,['id']);
  const marker=newId(),gate={sql:markerSql('workspaces'),parameters:[s.workspaceId,marker]},statements=[
    r.prepare(`UPDATE workspaces SET lastMutationId=? WHERE id=? AND ${actorSql()} AND ${orders.sql} AND ${projects.sql}`,[marker,s.workspaceId,...actorParameters(s),...orders.parameters,...projects.parameters]),
    r.prepare(`DELETE FROM memberProjectOrder WHERE workspaceId=? AND memberId=? AND ${gate.sql}`,[s.workspaceId,s.memberId,...gate.parameters]),
  ];
  if(rows.length)statements.push(gatedInsert(r,'memberProjectOrder',rows,gate));
  await matchedBatch(r,statements);return {projectIds};
}
