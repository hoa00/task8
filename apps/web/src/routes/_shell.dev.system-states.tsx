import { createFileRoute } from '@tanstack/react-router';
import { SystemStatesGallery } from '../features/dev/Galleries';
export const Route=createFileRoute('/_shell/dev/system-states')({component:SystemStatesGallery});
