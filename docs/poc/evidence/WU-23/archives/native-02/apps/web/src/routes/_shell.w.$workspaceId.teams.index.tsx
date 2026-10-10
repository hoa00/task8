import { createFileRoute } from '@tanstack/react-router';
import { TeamsPage } from '../features/teams/TeamsPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/teams/')({component:TeamsPage});
