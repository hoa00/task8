import { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentPropsWithRef, ReactNode, RefObject } from 'react';
import { OverlayContext, OverlayScopeContext, focusables, useOverlayController, useOverlayLayer } from './overlay-context';
import type { OverlayController, OverlayDismissReason, OverlayLayer } from './overlay-context';
import { IconButton } from './controls';
import { Icon } from './icons';

function createController(host: HTMLElement | null, initiallySettled: boolean): OverlayController {
    const layers: OverlayLayer[] = []; const returns = new Map<string, number>();
    let savedOverflow: string | null = null; let savedPadding = '';
    const lock = () => {
      const modal = layers.some(layer => layer.modal);
      if (modal && savedOverflow === null) {
        savedOverflow = document.body.style.overflow; savedPadding = document.body.style.paddingRight;
        const gap = innerWidth - document.documentElement.clientWidth;
        if (gap) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gap}px`;
        document.body.style.overflow = 'hidden';
      } else if (!modal && savedOverflow !== null) {
        document.body.style.overflow = savedOverflow; document.body.style.paddingRight = savedPadding; savedOverflow = null;
      }
    };
    return { initiallySettled, host, layers, register(layer, focus, initial, restore) {
      const pending = returns.get(layer.id); if (pending !== undefined) { cancelAnimationFrame(pending); returns.delete(layer.id); }
      // React mounts descendant layout effects first; parents must precede already registered children.
      const childIndex = layers.findIndex(child => child.parentId === layer.id);
      if (childIndex === -1) layers.push(layer); else layers.splice(childIndex, 0, layer);
      lock();
      if (focus && !initiallySettled && layers.at(-1) === layer) (initial ?? layer.node.querySelector<HTMLElement>('[autofocus],[aria-checked="true"]:not(:disabled)') ?? focusables(layer.node)[0] ?? layer.node).focus({ preventScroll: true });
      return () => {
        const wasTop = layers.at(-1)?.id === layer.id; const index = layers.indexOf(layer); if (index !== -1) layers.splice(index, 1); lock();
        if (focus && wasTop && restore) returns.set(layer.id, requestAnimationFrame(() => {
          returns.delete(layer.id);
          const active = document.activeElement;
          // A newer editor or overlay may have deliberately taken focus since dismissal.
          const hasNewFocus = active instanceof HTMLElement && active.isConnected && active !== document.body && active !== document.documentElement && !layer.node.contains(active);
          if (!hasNewFocus && restore.isConnected) restore.focus({ preventScroll: true });
        }));
      };
    } };
}
export interface OverlayProviderProps { children: ReactNode; initialState?: 'settled' }
export function OverlayProvider({ children, initialState }: OverlayProviderProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const controller = useMemo(() => createController(host, initialState === 'settled'), [host, initialState]);
  useEffect(() => {
    const descendant = (child: OverlayLayer, parent: OverlayLayer): boolean => {
      let parentId = child.parentId;
      while (parentId) { if (parentId === parent.id) return true; parentId = controller.layers.find(layer => layer.id === parentId)?.parentId ?? null; }
      return false;
    };
    const modalScope = () => { const modal = [...controller.layers].reverse().find(layer => layer.modal); return modal ? controller.layers.filter(layer => layer === modal || descendant(layer, modal)) : []; };
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const top = controller.layers.at(-1);
      if (event.key === 'Escape' && top) { event.preventDefault(); event.stopPropagation(); top.dismiss('escape'); return; }
      if (event.key !== 'Tab') return;
      const scope = modalScope(); if (!scope.length) return;
      const items = scope.flatMap(layer => focusables(layer.node)); const index = items.indexOf(document.activeElement as HTMLElement);
      if (!items.length) { event.preventDefault(); scope[0]?.node.focus(); }
      else if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && (index === items.length - 1 || index === -1)) { event.preventDefault(); items[0]?.focus(); }
    };
    const outside = (event: PointerEvent) => { if (event.target instanceof Element && event.target.closest('[data-overlay-notification]')) return; const top = controller.layers.at(-1); if (top && event.target instanceof Node && !top.node.contains(event.target) && !top.anchor?.contains(event.target)) top.dismiss('outside'); };
    const focusin = (event: FocusEvent) => {
      const scope = modalScope(); if (scope.length && event.target instanceof Node && !scope.some(layer => layer.node.contains(event.target as Node))) (focusables(scope[0]!.node)[0] ?? scope[0]!.node).focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown); document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin', focusin);
    return () => { document.removeEventListener('keydown', keydown); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', focusin); };
  }, [controller]);
  return <OverlayContext value={controller}>{children}<div ref={setHost} data-overlay-host="" /></OverlayContext>;
}
export interface PortalProps { children: ReactNode }
export function Portal({ children }: PortalProps) { const { host } = useOverlayController(); return host ? createPortal(children, host) : null; }
export interface DialogProps extends Omit<ComponentPropsWithRef<'section'>, 'onChange'> {
  open: boolean; onOpenChange: (open: boolean, reason: OverlayDismissReason) => void; size?: 'sm' | 'md' | 'lg';
  mode?: 'modal' | 'drawer' | 'palette'; modal?: boolean; initialFocus?: RefObject<HTMLElement | null>; returnFocus?: RefObject<HTMLElement | null>;
  /** Keep the finite first entrance until a controlled owner action changes this revision. */
  entryRevision?: string;
}
const dialogSizes = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[720px]' };
export function Dialog({ open, onOpenChange, size = 'md', mode = 'modal', modal = mode !== 'drawer', initialFocus, returnFocus, entryRevision, ref, children, className = '', ...props }: DialogProps) {
  const node = useRef<HTMLElement>(null), scrim = useRef<HTMLDivElement>(null); const { scope, id } = useOverlayLayer({ open, node, modal, initialFocus, returnFocus, onOpenChange });
  useImperativeHandle(ref, () => node.current!);
  const initiallySettled = useOverlayController().initiallySettled;
  const previousEntry = useRef({ open: false, revision: entryRevision });
  useLayoutEffect(() => {
    if (open && previousEntry.current.open && entryRevision !== previousEntry.current.revision) { node.current?.setAttribute('data-entered', ''); scrim.current?.setAttribute('data-entered', ''); }
    previousEntry.current = { open, revision: entryRevision };
  }, [open, entryRevision]);
  const depth = mode === 'drawer' ? scope.dialogDepth : scope.dialogDepth + 1; const z = mode === 'palette' ? 90 : mode === 'drawer' ? 50 : 61 + 2 * depth;
  if (!open) return null;
  const content = <section {...props} ref={node} role="dialog" aria-modal={modal || undefined} tabIndex={-1} data-overlay-kind={mode} data-overlay-initial-state={initiallySettled ? 'settled' : undefined} data-entered={initiallySettled ? '' : undefined} onAnimationEnd={event => { props.onAnimationEnd?.(event); if (entryRevision === undefined && event.target === event.currentTarget) event.currentTarget.setAttribute('data-entered', ''); }} className={`${mode === 'drawer' ? 'ui-drawer fixed inset-y-0 right-0 flex w-[min(620px,100vw)] flex-col border-0 border-l border-solid border-border bg-surface [box-shadow:-18px_0_40px_-24px_rgba(0,0,0,0.25)]' : mode === 'palette' ? 'fixed left-1/2 top-[12vh] flex max-h-[70vh] w-[min(640px,calc(100vw-32px))] [transform:translateX(-50%)] flex-col overflow-hidden rounded-[12px] bg-surface [box-shadow:var(--shadow-pop)] source-mobile:top-2' : `ui-dialog flex max-h-[80vh] w-full flex-col rounded-[12px] bg-surface [box-shadow:var(--shadow-pop)] ${dialogSizes[size]}`} ${className}`} style={{ ...props.style, ...(mode !== 'modal' ? { zIndex: z } : {}) }}>{children}</section>;
  return <Portal><OverlayScopeContext value={{ id, dialogDepth: depth }}>{(modal || mode === 'modal') && <div ref={scrim} data-overlay-scrim="" data-entered={initiallySettled ? '' : undefined} onAnimationEnd={event => { if (entryRevision === undefined && event.target === event.currentTarget) event.currentTarget.setAttribute('data-entered', ''); }} className="ui-overlay-scrim fixed inset-0 bg-overlay" style={{ zIndex: z - 1 }} />}{mode !== 'modal' ? content : <div className="ui-dialog-wrap fixed inset-0 flex items-start justify-center overflow-y-auto px-4 pb-4 pt-[10vh]" style={{ zIndex: z }}>{content}</div>}</OverlayScopeContext></Portal>;
}
export interface DialogHeaderProps extends Omit<ComponentPropsWithRef<'div'>, 'title'> { title: ReactNode; titleId: string; /** An explicit empty string groups the title without adding subtitle spacing. */ description?: ReactNode; onClose: () => void }
export function DialogHeader({ title, titleId, description, onClose, className = '', ...props }: DialogHeaderProps) { const heading = <h2 id={titleId} className="m-0 text-md font-semibold">{title}</h2>; return <div {...props} className={`flex items-center gap-2 px-4 pt-[14px] ${className}`}>{description === undefined ? heading : <div>{heading}{description !== '' && <div className="mt-[2px] text-[12.5px] text-secondary">{description}</div>}</div>}<IconButton size="sm" aria-label="Close" className="ml-auto" onClick={onClose}><Icon name="x" size={16} /></IconButton></div>; }
export type DialogBodyProps = ({ as?: 'div' } & ComponentPropsWithRef<'div'>) | ({ as: 'form' } & ComponentPropsWithRef<'form'>);
export function DialogBody(props: DialogBodyProps) { if (props.as === 'form') { const { as, className = '', ...formProps } = props; void as; return <form {...formProps} className={`flex flex-col gap-[14px] overflow-y-auto px-4 py-[14px] ${className}`} />; } const { as, className = '', ...divProps } = props; void as; return <div {...divProps} className={`flex flex-col gap-[14px] overflow-y-auto px-4 py-[14px] ${className}`} />; }
export type DialogFooterProps = ComponentPropsWithRef<'div'>;
export function DialogFooter({ className = '', ...props }: DialogFooterProps) { return <div {...props} className={`flex items-center gap-2 border-0 border-t border-solid border-border px-4 py-3 ${className}`} />; }

export type OverlayPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right' | 'left';
export interface OverlayPoint { x: number; y: number }
function setOverlayPosition(element: HTMLElement, x: number, y: number) { element.style.left = `${x}px`; element.style.top = `${y}px`; }
function usePlacement(open: boolean, node: RefObject<HTMLElement | null>, anchor: RefObject<HTMLElement | null>, placement: OverlayPlacement, point?: OverlayPoint, tooltip = false) {
  const { host } = useOverlayController();
  useLayoutEffect(() => {
    if (!open || !host || !node.current) return;
    const position = () => {
      const el = node.current; const r = anchor.current?.getBoundingClientRect(); if (!el || (!r && !point)) return;
      const gap = tooltip ? 6 : 4;
      // Source popHtml assigns the anchor coordinates before placePop measures
      // shrink-to-fit content. Measuring at left:auto widens mobile builders.
      if (!tooltip) setOverlayPosition(el, point?.x ?? r!.left, point?.y ?? r!.bottom + gap);
      const w = el.offsetWidth, h = el.offsetHeight;
      let x = point?.x ?? r!.left; let y = point?.y ?? r!.bottom + gap;
      if (!point && r) {
        if (tooltip) x = r.left + (r.width - w) / 2;
        else if (placement.endsWith('end')) x = r.right - w;
        if (placement.startsWith('top')) y = r.top - gap - h;
        if (placement === 'right' || placement === 'left') { x = placement === 'right' ? r.right + 8 : r.left - 8 - w; y = r.top + (r.height - h) / 2; }
      }
      if (x + w > innerWidth - 8) x = point ? x - w : r ? r.right - w : x;
      if (y + h > innerHeight - 8) y = (point ? point.y - gap : r!.top - gap) - h;
      // Source popovers align to the anchor's right edge after a flip. A second
      // viewport inset changes shrink-to-fit search menus after left is set.
      setOverlayPosition(el, tooltip ? Math.max(8, Math.min(x, innerWidth - w - 8)) : Math.max(8, x), Math.max(8, Math.min(y, innerHeight - h - 8)));
    };
    position(); const observer = new ResizeObserver(position); observer.observe(node.current); if (anchor.current) observer.observe(anchor.current);
    window.addEventListener('resize', position); document.addEventListener('scroll', position, true); document.addEventListener('animationend', position, true); document.addEventListener('transitionend', position, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true); document.removeEventListener('animationend', position, true); document.removeEventListener('transitionend', position, true); };
  }, [open, node, anchor, placement, point, tooltip, host]);
}
export interface PopoverProps extends ComponentPropsWithRef<'div'> {
  open: boolean; onOpenChange: (open: boolean, reason: OverlayDismissReason) => void; anchor: RefObject<HTMLElement | null>;
  placement?: OverlayPlacement; point?: OverlayPoint; initialFocus?: RefObject<HTMLElement | null>; returnFocus?: RefObject<HTMLElement | null>; focus?: boolean;
}
export function Popover({ open, onOpenChange, anchor, placement = 'bottom-start', point, initialFocus, returnFocus, focus = true, ref, children, className = '', ...props }: PopoverProps) {
  const node = useRef<HTMLDivElement>(null); const { id, scope } = useOverlayLayer({ open, node, anchor, initialFocus, returnFocus, focus, onOpenChange });
  useImperativeHandle(ref, () => node.current!);
  usePlacement(open, node, anchor, placement, point);
  useEffect(() => { if (!open) return; const resize = () => onOpenChange(false, 'outside'); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, [open, onOpenChange]);
  if (!open) return null;
  return <Portal><OverlayScopeContext value={{ ...scope, id }}><div {...props} ref={node} tabIndex={-1} data-overlay-kind="popover" onAnimationEnd={event => { props.onAnimationEnd?.(event); if (event.target === event.currentTarget) event.currentTarget.setAttribute('data-entered', ''); }} className={`ui-popover fixed z-[80] max-h-[min(420px,70vh)] min-w-[200px] max-w-[320px] origin-top-left overflow-y-auto rounded-lg bg-surface p-1 text-body [box-shadow:var(--shadow-pop)] ${className}`}>{children}</div></OverlayScopeContext></Portal>;
}
export interface MenuProps extends PopoverProps { label: string }
export function Menu({ label, onOpenChange, onKeyDown, ...props }: MenuProps) {
  return <Popover {...props} role="menu" aria-label={label} onOpenChange={onOpenChange} onKeyDown={event => {
    onKeyDown?.(event); if (event.defaultPrevented) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')]; const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[next]?.focus(); items[next]?.scrollIntoView({ block: 'nearest' }); }
    else if (event.key === 'Tab') onOpenChange(false, 'tab');
    else if (event.key.length === 1 && event.key.trim() && !(event.target instanceof HTMLElement && (event.target.matches('input,textarea') || event.target.isContentEditable))) { const letter = event.key.toLowerCase(); const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)]; ordered.find(item => item.textContent?.trim().toLowerCase().startsWith(letter))?.focus(); }
  }} />;
}
export interface ContextMenuProps extends MenuProps { point: OverlayPoint }
export function ContextMenu(props: ContextMenuProps) { return <Menu {...props} />; }
export interface MenuItemProps extends ComponentPropsWithRef<'button'> { onSelect?: () => void; danger?: boolean; checked?: boolean; icon?: ReactNode; shortcut?: ReactNode }
export function MenuItem({ onSelect, danger = false, checked, icon, shortcut, children, className = '', onClick, ...props }: MenuItemProps) { return <button {...props} type="button" role={checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={checked} onClick={event => { onClick?.(event); if (!event.defaultPrevented) onSelect?.(); }} className={`flex min-h-[30px] w-full items-center gap-[9px] whitespace-nowrap rounded-sm px-2 text-left text-body source-hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-45 disabled:pointer-events-none ${danger ? 'text-red [&>svg]:text-red' : 'text-foreground [&>svg]:text-secondary'} ${className}`}>{icon}{children}{shortcut && <span className="ml-auto flex items-center gap-1 text-xs text-muted">{shortcut}</span>}{checked && <span className="ml-auto text-accent"><Icon name="check" size={14} className="text-secondary" /></span>}</button>; }
export interface MenuGroupProps extends ComponentPropsWithRef<'div'> { label?: string }
export function MenuGroup({ label, children, ...props }: MenuGroupProps) { return <div {...props} role="group" aria-label={label}>{label && <div className="px-2 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[.06em] text-muted">{label}</div>}{children}</div>; }
export function MenuSeparator() { return <div role="separator" className="-mx-1 my-1 h-px bg-divider" />; }
export interface TooltipProps { open: boolean; onOpenChange: (open: boolean) => void; anchor: RefObject<HTMLElement | null>; label: string; placement?: OverlayPlacement; id?: string }
export function Tooltip({ open, onOpenChange, anchor, label, placement = 'bottom-start', id: suppliedId }: TooltipProps) {
  const node = useRef<HTMLDivElement>(null); const generatedId = useId(); const id = suppliedId ?? generatedId;
  useOverlayLayer({ open, node, anchor, focus: false, onOpenChange }); usePlacement(open, node, anchor, placement, undefined, true);
  useEffect(() => {
    const el = anchor.current; if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => { clearTimeout(timer); timer = setTimeout(() => onOpenChange(true), 350); };
    const hide = () => { clearTimeout(timer); onOpenChange(false); };
    el.addEventListener('mouseenter', show); el.addEventListener('mouseleave', hide); el.addEventListener('focus', show); el.addEventListener('blur', hide);
    return () => { clearTimeout(timer); el.removeEventListener('mouseenter', show); el.removeEventListener('mouseleave', hide); el.removeEventListener('focus', show); el.removeEventListener('blur', hide); };
  }, [anchor, onOpenChange]);
  useEffect(() => { const el = anchor.current; if (!open || !el) return; const previous = el.getAttribute('aria-describedby'); el.setAttribute('aria-describedby', [previous, id].filter(Boolean).join(' ')); return () => { if (previous === null) el.removeAttribute('aria-describedby'); else el.setAttribute('aria-describedby', previous); }; }, [open, anchor, id]);
  return open ? <Portal><div ref={node} id={id} role="tooltip" data-overlay-kind="tooltip" className="ui-tooltip pointer-events-none fixed z-[200] whitespace-nowrap rounded-[5px] bg-foreground px-[7px] py-[5px] text-[11px] font-medium leading-none text-inverse">{label}</div></Portal> : null;
}
