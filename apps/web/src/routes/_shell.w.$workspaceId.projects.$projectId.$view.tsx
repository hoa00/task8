import {createFileRoute,notFound} from '@tanstack/react-router';
import {projectTabs} from '../app/navigation';
import {ProjectPage} from '../features/projects/ProjectPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/projects/$projectId/$view')({params:{parse:params=>{if(!(projectTabs as readonly string[]).includes(params.view))throw notFound();return params;}},component:ProjectPage});
