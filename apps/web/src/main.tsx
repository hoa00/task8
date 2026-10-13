import { StrictMode } from 'react';
import type { OperationOutput } from '@studio/contracts/api';
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
import { StudioApiError } from './data/errors';
import { TranslationProvider } from './i18n/TranslationProvider';

applyRootPreferences(readThemePreferences());
const publicEnv = parsePublicEnv(import.meta.env);
const runtime = createDataRuntime(publicEnv);
const queryClient = createStudioQueryClient();
runtime.auth?.connect(queryClient);
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing React root element');
rootElement.dataset.dataMode = publicEnv.dataMode;

// Startup aliases are resolved once, before Router history observes the URL.
if (Object.hasOwn(legacyAliases, location.hash.slice(1))) {
  try {
    const session = await queryClient.ensureQueryData(studioQueryOptions(runtime.client,'getSession',{}));
    const destination=session.data.currentWorkspaceId===null?'/waiting-for-workspace':legacyDestination(location.hash,session.data.currentWorkspaceId);
    if(destination)history.replaceState(history.state,'',destination);
  }catch(error){ if(error instanceof StudioApiError&&error.status===401)history.replaceState(history.state,'','/login'); }

}
const router = createStudioRouter({runtime, queryClient});
runtime.auth?.subscribe(event=>{
  if(event==='signed-out')void router.navigate({to:'/login',search:{},replace:true});
  else if(event==='session-changed'){
    const session=queryClient.getQueryData<OperationOutput<'getSession'>>(['session']);
    void router.navigate({href:session?(session.data.currentWorkspaceId===null?'/waiting-for-workspace':'/'):'/login',replace:true});
  }
});
runtime.auth?.start();
createRoot(rootElement).render(
  <StrictMode>
    <TranslationProvider>
    <ThemeProvider>
      <StudioDataProvider runtime={runtime} queryClient={queryClient}>
        <RouterProvider router={router} />
      </StudioDataProvider>
    </ThemeProvider>
    </TranslationProvider>
  </StrictMode>,
);
