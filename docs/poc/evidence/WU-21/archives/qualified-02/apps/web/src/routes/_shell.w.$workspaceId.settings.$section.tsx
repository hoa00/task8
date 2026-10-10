import {createFileRoute,notFound} from '@tanstack/react-router';
import {settingsSections} from '../app/navigation';
import {PendingPage} from '../app/shell/PendingPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/settings/$section')({params:{parse:params=>{if(!(settingsSections as readonly string[]).includes(params.section))throw notFound();return params;}},component:PendingPage});
