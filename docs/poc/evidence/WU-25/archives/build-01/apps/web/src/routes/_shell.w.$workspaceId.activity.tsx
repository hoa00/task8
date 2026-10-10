import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceActivity } from '../features/activity/WorkspaceActivity';
export const Route=createFileRoute('/_shell/w/$workspaceId/activity')({component:WorkspaceActivity});
