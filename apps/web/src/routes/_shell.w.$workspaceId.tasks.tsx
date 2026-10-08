import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceTasks } from '../features/tasks/TaskListPages';
export const Route=createFileRoute('/_shell/w/$workspaceId/tasks')({component:WorkspaceTasks});
