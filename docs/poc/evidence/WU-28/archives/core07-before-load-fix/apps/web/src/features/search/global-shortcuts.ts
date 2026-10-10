import { useEffect, useLayoutEffect, useRef } from 'react';
import { commandDefinitions } from './commands';
import type { CommandId } from './commands';
export interface GlobalShortcutActions { run: (id: CommandId) => void; togglePalette: () => void; blocked: () => boolean }
export function isTypingTarget(target: EventTarget | null): boolean { return target instanceof HTMLElement && (!!target.closest('input,textarea,select') || target.isContentEditable || !!target.closest('[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]')); }
export function useGlobalShortcuts(actions: GlobalShortcutActions) {
 const latest = useRef(actions);
 useLayoutEffect(() => { latest.current = actions; });
 useEffect(() => {
  let pending = 0;
  const listener = (event: KeyboardEvent) => {
   if (event.defaultPrevented || event.isComposing || event.repeat) return;
   const mod = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
   // Exact source exceptions: ModK and ModShiftL work while typing. Escape,
   // Tab and form/composer/editor keys remain with the current local owner.
   if (mod && key === 'k' && !event.altKey && !event.shiftKey) { event.preventDefault(); pending = 0; latest.current.togglePalette(); return; }
   if (mod && event.shiftKey && key === 'l' && !event.altKey) { event.preventDefault(); pending = 0; latest.current.run('dark'); return; }
   if (isTypingTarget(event.target) || mod || event.altKey || latest.current.blocked()) { pending = 0; return; }
   if (pending && Date.now() - pending < 1200) { pending = 0; const command = commandDefinitions.find(row => row.keys?.[0] === 'G' && row.keys[1]?.toLowerCase() === key) ?? (key === 'm' ? commandDefinitions.find(row => row.id === 'members') : undefined); if (command) { event.preventDefault(); latest.current.run(command.id); } return; }
   pending = 0;
   if (key === 'g') { pending = Date.now(); return; }
   const command = commandDefinitions.find(row => row.keys?.length === 1 && row.keys[0]?.toLowerCase() === key);
   if (command) { event.preventDefault(); latest.current.run(command.id); }
  };
  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
 }, []);
}
