import { CapabilitiesSchema } from '@studio/contracts/api';
import { apiLimits } from './limits.ts';
export const apiCapabilities = CapabilitiesSchema.parse({
  dataMode: 'http',
  identityMode: 'development',
  features: {
    projects: 'implemented',
    tasks: 'implemented',
    teams: 'implemented',
    comments: 'implemented',
    notificationState: 'implemented',
    fileMetadata: 'implemented',
    fileBytes: 'implemented',
    workspaceProvisioning: 'unavailable',
    invitations: 'unavailable',
    projectSharing: 'unavailable',
    authentication: 'unavailable',
    accountSecurity: 'unavailable',
    billing: 'unavailable',
  },
  limits: apiLimits,
});
