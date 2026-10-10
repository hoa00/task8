import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { createDataRuntime } from '#studio-adapter';
import { StudioDataProvider } from './data/StudioDataProvider';
import { createStudioQueryClient } from './data/queries';
import { parsePublicEnv } from './app/env';
import { createStudioRouter } from './app/router';
import { legacyDestination, legacyAliases } from './app/navigation';
import { studioQueryOptions } from './data/queries';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyRootPreferences, readThemePreferences } from './theme/preferences';
import './styles/app.css';

applyRootPreferences(readThemePreferences());
const publicEnv = parsePublicEnv(import.meta.env);
const runtime = createDataRuntime(publicEnv);
const queryClient = createStudioQueryClient();
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing React root element');
rootElement.dataset.dataMode = publicEnv.dataMode;

// Startup aliases are resolved once, before Router history observes the URL.
if (Object.hasOwn(legacyAliases, location.hash.slice(1))) {
  const session = await queryClient.ensureQueryData(studioQueryOptions(runtime.client, 'getSession', {}));
  const destination = legacyDestination(location.hash, session.data.currentWorkspaceId);
  if (destination) history.replaceState(history.state, '', destination);
}
const router = createStudioRouter({runtime, queryClient});
createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <StudioDataProvider runtime={runtime} queryClient={queryClient}>
        <RouterProvider router={router} />
      </StudioDataProvider>
    </ThemeProvider>
  </StrictMode>,
);
