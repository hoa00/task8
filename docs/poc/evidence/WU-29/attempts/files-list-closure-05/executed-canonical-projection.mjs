// Contract-qualified input projections leave the locked fixture and Source code
// untouched. Original failed captures remain separate immutable attempts.
import { sourceId } from '../../../packages/contracts/src/source-identities.ts';

export function applyCanonicalProjection(fixture, row) {
 const changes = [];
 if (row.route === 'activity' || row.route === 'project' && ['overview', 'activity'].includes(row.params?.tab)) {
  const before = fixture.data.activity.map(item => item.id);
  fixture.data.activity.sort((a, b) => b.at - a.at || sourceId('activity', b.id).localeCompare(sourceId('activity', a.id)));
  changes.push({ kind: 'canonical activity order', contract: 'API_CONTRACT §8 newest-first activity stable createdAt/id; actual activity keyset read uses createdAt DESC/id DESC; ProjectOverview latest six. Locked fixture has no timestamp ties; this capture does not prove synthetic tie behavior.', field: 'data.activity array order', before, after: fixture.data.activity.map(item => item.id), contentChanged: false });
 }
 const directory = row.route === 'members' || row.route === 'teams' || row.route === 'settings' && ['members', 'teams'].includes(row.params?.sec);
 if (directory) for (const project of fixture.data.projects) {
  if (!project.private || project.members.includes(fixture.data.me)) continue;
  if (row.route === 'members' || row.route === 'settings' && row.params?.sec === 'members') {
   changes.push({ kind: 'authorized member project counts', contract: 'API_CONTRACT authorized active project counts exclude inaccessible private projects', field: `data.projects[${project.id}].members`, before: [...project.members], after: [] }); project.members = [];
  } else {
   changes.push({ kind: 'authorized team project counts', contract: 'API_CONTRACT team project counts exclude inaccessible private projects', field: `data.projects[${project.id}].team`, before: project.team, after: null }); project.team = null;
  }
 }
 return changes;
}
