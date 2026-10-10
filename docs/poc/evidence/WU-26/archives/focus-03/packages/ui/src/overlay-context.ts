import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

export type OverlayDismissReason = 'escape' | 'outside' | 'tab';
export interface OverlayLayer {
  id: string; parentId: string | null; node: HTMLElement; anchor: HTMLElement | null;
  modal: boolean; dismiss: (reason: OverlayDismissReason) => void;
}
export interface OverlayScope { id: string | null; dialogDepth: number }
export const OverlayScopeContext = createContext<OverlayScope>({ id: null, dialogDepth: -1 });
export interface OverlayController { initiallySettled: boolean; host: HTMLElement | null; layers: OverlayLayer[]; register: (layer: OverlayLayer, focus: boolean, initial: HTMLElement | null, restore: HTMLElement | null) => () => void }
export const OverlayContext = createContext<OverlayController | null>(null);
export function useOverlayController() {
  const controller = useContext(OverlayContext);
  if (!controller) throw new Error('Overlay primitives require OverlayProvider');
  return controller;
}
// Features honor the same snapshot-only no-initial-focus state as Dialog.
export function useOverlayInitialState(): 'settled' | 'default' { return useOverlayController().initiallySettled ? 'settled' : 'default'; }
export const focusables = (node: HTMLElement) => [...node.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]')].filter(el => el.getClientRects().length && !el.closest('[inert]'));
export function useOverlayLayer({ open, node, anchor, modal = false, focus = true, initialFocus, returnFocus, onOpenChange }: {
  open: boolean; node: RefObject<HTMLElement | null>; anchor?: RefObject<HTMLElement | null> | undefined; modal?: boolean; focus?: boolean;
  initialFocus?: RefObject<HTMLElement | null> | undefined; returnFocus?: RefObject<HTMLElement | null> | undefined; onOpenChange: (open: boolean, reason: OverlayDismissReason) => void;
}) {
  const controller = useOverlayController(); const scope = useContext(OverlayScopeContext); const id = useId();
  const callback = useRef(onOpenChange);
  useLayoutEffect(() => { callback.current = onOpenChange; });
  useLayoutEffect(() => {
    if (!open || !controller.host || !node.current) return;
    const opener = returnFocus?.current ?? anchor?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    return controller.register({ id, parentId: scope.id, node: node.current, anchor: anchor?.current ?? null, modal, dismiss: reason => callback.current(false, reason) }, focus, initialFocus?.current ?? null, opener);
  }, [open, controller, id, scope.id, node, anchor, modal, focus, initialFocus, returnFocus]);
  return { controller, scope, id };
}
