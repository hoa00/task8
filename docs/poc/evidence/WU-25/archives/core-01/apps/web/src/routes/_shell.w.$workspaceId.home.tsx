import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '../features/dashboards/HomePage';
export const Route=createFileRoute('/_shell/w/$workspaceId/home')({component:HomePage});
