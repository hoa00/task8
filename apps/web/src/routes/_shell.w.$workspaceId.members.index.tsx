import { createFileRoute } from '@tanstack/react-router';
import { MembersPage } from '../features/people/MembersPage';
export const Route = createFileRoute('/_shell/w/$workspaceId/members/')({ component: MembersPage });
