import {createFileRoute,notFound} from '@tanstack/react-router';
import {projectTabs} from '../app/navigation';
import {PendingPage} from '../app/shell/PendingPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/projects/$projectId/$view')({params:{parse:params=>{if(!(projectTabs as readonly string[]).includes(params.view))throw notFound();return params;}},component:PendingPage});
