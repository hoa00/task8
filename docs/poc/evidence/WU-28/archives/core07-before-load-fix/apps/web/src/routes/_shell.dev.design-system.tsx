import { createFileRoute } from '@tanstack/react-router';
import { DesignSystemGallery } from '../features/dev/Galleries';
export const Route=createFileRoute('/_shell/dev/design-system')({component:DesignSystemGallery});
