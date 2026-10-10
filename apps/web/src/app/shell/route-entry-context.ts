import { createContext, useContext } from 'react';

// Startup renders the requested page directly. A later pathname change belongs to native
// navigation and must retain the Source go() entrance animation.
export const InitialRouteEntryContext = createContext(false);
export function useInitialRouteEntry() { return useContext(InitialRouteEntryContext); }
