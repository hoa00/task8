import { createFileRoute } from '@tanstack/react-router';
import { MyTasksList } from '../features/tasks/TaskListPages';
export const Route=createFileRoute('/_shell/w/$workspaceId/my-tasks')({component:MyTasksList});
