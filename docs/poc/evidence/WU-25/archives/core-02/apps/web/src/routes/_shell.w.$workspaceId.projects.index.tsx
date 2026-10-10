import { createFileRoute } from '@tanstack/react-router';
import { ProjectCatalogue } from '../features/projects/ProjectCatalogue';
export const Route=createFileRoute('/_shell/w/$workspaceId/projects/')({component:ProjectCatalogue});
