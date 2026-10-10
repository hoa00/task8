import { createFileRoute } from '@tanstack/react-router';
import { InboxPage } from '../features/notifications/InboxPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/inbox')({component:InboxPage});
