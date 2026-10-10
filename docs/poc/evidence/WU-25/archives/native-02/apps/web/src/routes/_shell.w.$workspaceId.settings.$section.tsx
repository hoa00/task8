import {createFileRoute,notFound} from '@tanstack/react-router';
import {settingsSections} from '../app/navigation';
import {SettingsPage} from '../features/settings/SettingsPage';
export const Route=createFileRoute('/_shell/w/$workspaceId/settings/$section')({params:{parse:params=>{if(!(settingsSections as readonly string[]).includes(params.section))throw notFound();return params;}},component:SettingsRoute});
function SettingsRoute(){const {section}=Route.useParams();return <SettingsPage section={section}/>;}
