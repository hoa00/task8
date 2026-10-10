import { createFileRoute } from '@tanstack/react-router';
import { validId } from '../app/route-context';
import { TeamDetail } from '../features/teams/TeamDetail';
export const Route = createFileRoute('/_shell/w/$workspaceId/teams/$teamId')({ beforeLoad: ({ params }) => { validId(params.teamId); }, component: TeamRoute });
function TeamRoute() { const { teamId } = Route.useParams(); return <TeamDetail key={teamId} teamId={teamId}/>; }
