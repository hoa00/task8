import { createFileRoute } from '@tanstack/react-router';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/notifications')({component:NotificationsPage});
