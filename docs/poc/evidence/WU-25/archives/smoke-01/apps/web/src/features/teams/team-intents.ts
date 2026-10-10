import { createContext, useContext } from 'react';
export interface TeamIntents { newTeam: () => void; editTeam: (id: string) => void }
export const TeamIntentContext = createContext<TeamIntents | null>(null);
export function useTeamIntents() { const value = useContext(TeamIntentContext); if (!value) throw Error('Team intents require AppShell'); return value; }
