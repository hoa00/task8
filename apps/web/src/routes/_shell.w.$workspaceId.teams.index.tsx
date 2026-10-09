import { createFileRoute } from '@tanstack/react-router';
import { TeamsPage } from '../features/people/MembersPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/teams/')({component:TeamsPage});
