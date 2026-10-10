import { createContext, useContext } from 'react';
export interface DevScenarioIntents { loadComplete: () => void; demoMutation: (run: () => void) => void; offline: boolean; retrying: boolean; loading: boolean; toggleOffline: () => void; retryOnline: () => void; replaySkeleton: () => void; resetFixture: () => void; demoToast: (kind: 'ok' | 'err' | 'retry') => void; previewConfirm: () => void }
export const DevScenarioContext = createContext<DevScenarioIntents | null>(null);
export function useDevScenario() { const value = useContext(DevScenarioContext); if (!value) throw Error('Dev scenarios require AppShell'); return value; }
