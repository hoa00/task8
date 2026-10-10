import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceTimeline } from '../features/timeline/TimelinePages';
export const Route=createFileRoute('/_shell/w/$workspaceId/timeline')({component:WorkspaceTimeline});
