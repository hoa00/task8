import { createContext, useContext } from 'react';
import type { UndoDescriptorDto } from '@studio/contracts/api';
import type { ToastInput } from '@studio/ui';
export interface AppServices {
  surfaceRevision: string;
  surfaceOpened: () => void;
  notice: (
    message: string,
    undo?: UndoDescriptorDto,
    options?: Pick<ToastInput, 'kind' | 'duration' | 'action'>,
  ) => void;
}
export const AppServicesContext = createContext<AppServices | null>(null);
export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (!services) throw Error('App services require the workspace shell');
  return services;
}
