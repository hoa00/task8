import { useQuery } from '@tanstack/react-query';
import { useDataRuntime } from '../../data/context';
import { useStudioQuery } from '../../data/queries';
import { useCompleteMembers } from './catalogue';
import { projectDirectory } from '../../data/people-demo';
import type { BootstrapDto, MemberDto } from '@studio/contracts/api';
import type { PeopleDemoContext, PeopleDemoState } from '../../data/people-demo';
export function usePeopleDirectory(data: BootstrapDto) { const catalog = useCompleteMembers(data.workspace.id), session = useStudioQuery('getSession', {}), { peopleDemo } = useDataRuntime(), key = ['workspace', data.workspace.id, 'demo-people', data.currentMember.id], context: PeopleDemoContext | undefined = catalog.data && session.data ? { workspaceId: data.workspace.id, principal: data.currentMember, members: catalog.data.items, teams: data.teams, capabilities: session.data.data.capabilities } : undefined;
 const demo = useQuery({ queryKey: key, enabled: !!context && !!peopleDemo, queryFn: () => peopleDemo!.read(context!) }); const state: PeopleDemoState = demo.data ?? { version: 1, invitations: [], roles: [], removedIds: [], statuses: [] }; const orderedIds: readonly string[] = data.members.map(member => member.id), rank = (id: string) => { const index = orderedIds.indexOf(id); return index < 0 ? orderedIds.length : index; };
 const members = projectDirectory(catalog.data?.items ?? [], state).sort((a, b) => rank(a.id) - rank(b.id)), actor = catalog.data?.items.find(member => member.id === data.currentMember.id), enabled = !!context && !!demo.data && session.data?.data.capabilities.features.invitations === 'demoOnly' && !!peopleDemo && !!actor && actor.status === 'active' && ['Owner', 'Admin'].includes(actor.role);
 return { catalog, session, demo, state, members, context, key, enabled, error: catalog.error ?? session.error ?? demo.error, ready: !!catalog.data && !!session.data && (!peopleDemo || !!demo.data) }; }
export function canAdministerMember(member: Pick<MemberDto, 'id' | 'role'>, principalId: string, enabled: boolean) { return enabled && member.role !== 'Owner' && member.id !== principalId; }
