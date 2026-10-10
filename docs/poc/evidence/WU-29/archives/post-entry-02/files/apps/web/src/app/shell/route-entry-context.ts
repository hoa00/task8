import { createContext, useContext } from 'react';

// Startup renders Home directly. A later pathname change belongs to native
// navigation and must retain the Source go() entrance animation.
export const InitialRouteEntryContext = createContext(true);
export function useInitialRouteEntry() { return useContext(InitialRouteEntryContext); }
