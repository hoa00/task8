import { createFileRoute } from '@tanstack/react-router';
import { Favorites } from '../features/projects/Favorites';
export const Route=createFileRoute('/_shell/w/$workspaceId/favorites')({component:Favorites});
