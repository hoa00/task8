import {createFileRoute} from '@tanstack/react-router';
import {validateProject} from '../app/route-context';
import {ProjectLayout} from '../app/shell/PendingPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/projects/$projectId')({beforeLoad:async({context,params})=>{await validateProject(context,params.projectId);},component:ProjectLayout});
