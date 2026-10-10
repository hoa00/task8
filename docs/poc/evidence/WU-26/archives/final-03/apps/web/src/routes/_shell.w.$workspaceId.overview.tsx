import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceOverview } from '../features/dashboards/WorkspaceOverview';
export const Route=createFileRoute('/_shell/w/$workspaceId/overview')({component:WorkspaceOverview});
