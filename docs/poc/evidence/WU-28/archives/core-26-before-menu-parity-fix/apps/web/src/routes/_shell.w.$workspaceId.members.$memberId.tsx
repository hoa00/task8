import { createFileRoute } from '@tanstack/react-router';
import { validId } from '../app/route-context';
import { MemberDetail } from '../features/people/MemberDetail';
export const Route = createFileRoute('/_shell/w/$workspaceId/members/$memberId')({ beforeLoad: ({ params }) => validId(params.memberId), component: MemberRoute });
function MemberRoute() { const { memberId } = Route.useParams(); return <MemberDetail key={memberId} memberId={memberId}/>; }
