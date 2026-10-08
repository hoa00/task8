import { createFileRoute } from '@tanstack/react-router';
import { PendingPage } from '../app/shell/PendingPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/calendar')({component:PendingPage});
