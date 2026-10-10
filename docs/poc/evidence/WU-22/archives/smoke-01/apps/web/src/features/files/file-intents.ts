import { createContext, useContext } from 'react';
import type { FileDto } from '@studio/contracts/api';
export interface FileIntents { openFile: (file: Pick<FileDto, 'id' | 'projectId' | 'workspaceId'>) => void; copyFile: (file: Pick<FileDto, 'id' | 'projectId' | 'workspaceId'>) => void }
export const FileIntentContext = createContext<FileIntents | null>(null);
export function useFileIntents(): FileIntents { const value = useContext(FileIntentContext); if (!value) throw Error('File intents require AppShell'); return value; }
