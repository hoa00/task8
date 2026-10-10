import type { UndoDescriptorDto } from '@studio/contracts/api';
import type { ToastInput } from '@studio/ui';
import { createContext, useContext } from 'react';
export interface ProjectIntents { overlayState: string; projectSurfaceOpened: () => void; newProject: () => void; editProject: (id: string) => void; shareProject: (id: string) => void; projectMenu: (id: string, anchor: HTMLElement) => void; favoriteProject: (id: string) => void; reorderProjects: (projectIds: readonly string[]) => Promise<void>; notice: (message: string, undo?: UndoDescriptorDto, options?: Pick<ToastInput, 'kind' | 'duration'>) => void }
export const ProjectIntentContext = createContext<ProjectIntents | null>(null);
export function useProjectIntents(): ProjectIntents { const value = useContext(ProjectIntentContext); if (!value) throw Error('Project intents require AppShell'); return value; }
