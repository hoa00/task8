import { Hono } from 'hono';
import { activityRoutes } from '../modules/activity/routes.ts';
import { commentRoutes } from '../modules/comments/routes.ts';
import { subtaskRoutes } from '../modules/tasks/subtask-routes.ts';
import type { ApiEnvironment } from '../runtime.ts';
export const collaborationRoutes = new Hono<ApiEnvironment>();
collaborationRoutes.route('/', subtaskRoutes);
collaborationRoutes.route('/', commentRoutes);
collaborationRoutes.route('/', activityRoutes);
