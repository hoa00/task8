import { createContext, useContext } from 'react';

export type UiTranslator = (message: string, values?: Record<string, string | number>) => string;
const identity: UiTranslator = message => message;
export const UiTranslationContext = createContext<UiTranslator>(identity);
export function useUiTranslation(): UiTranslator { return useContext(UiTranslationContext); }
