import { createContext, useContext } from 'react';
export interface PeopleIntents { changeRole: (id: string, role: 'Admin' | 'Member' | 'Guest') => void; invite: () => void; openProfile: (memberId: string) => void; assign: (memberId: string) => void; memberMenu: (memberId: string, anchor: HTMLElement) => void }
export const PeopleIntentContext = createContext<PeopleIntents | null>(null);
export function usePeopleIntents() { const value = useContext(PeopleIntentContext); if (!value) throw Error('People intents require AppShell'); return value; }
