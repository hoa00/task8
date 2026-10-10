import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceCalendar } from '../features/calendar/CalendarPages';
export const Route=createFileRoute('/_shell/w/$workspaceId/calendar')({component:WorkspaceCalendar});
