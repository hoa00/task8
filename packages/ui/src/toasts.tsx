import { useUiTranslation } from './translation-context';
import { useEffect, useRef, useState } from 'react';
import { Portal } from './overlays';
import { IconButton } from './controls';
import { Icon } from './icons';
import type { ToastMessage } from './toast-queue';
export interface ToastProps { toast: ToastMessage; onDismiss: (id: string) => void }
export function Toast({ toast, onDismiss }: ToastProps) { const t = useUiTranslation();
  const [exiting, setExiting] = useState(false); const [paused, setPaused] = useState(false); const done = useRef(false);
  const remaining = useRef(toast.duration ?? 4200); const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const close = () => { if (done.current) return; done.current = true; setExiting(true); };
  useEffect(() => {
    if (paused || exiting || toast.duration === 0) return;
    const start = performance.now(); const timer = setTimeout(() => { if (!done.current) { done.current = true; setExiting(true); } }, remaining.current);
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (performance.now() - start)); };
  }, [paused, exiting, toast.duration]);
  useEffect(() => {
    if (!exiting) return;
    exitTimer.current = setTimeout(() => onDismiss(toast.id), 160);
    return () => clearTimeout(exitTimer.current);
  }, [exiting, onDismiss, toast.id]);
  const kind = toast.kind ?? 'success';
  return <div role="status" data-toast-id={toast.id} data-exiting={exiting || undefined} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }} className="ui-toast pointer-events-auto flex min-h-10 max-w-[400px] items-center gap-[10px] rounded-default bg-foreground py-2 pl-3 pr-2 text-sm text-inverse [box-shadow:var(--shadow-pop)]">
    <Icon name={kind === 'error' ? 'circle-alert' : kind === 'info' ? 'info' : 'circle-check'} size={15} className={kind === 'error' ? 'text-red' : kind === 'success' ? 'text-green' : ''} /><span className="grow">{t(toast.message)}</span>
    {toast.action && <button type="button" disabled={exiting} className="rounded-[5px] px-2 py-[3px] font-semibold text-inverse opacity-90 source-hover:bg-[color-mix(in_srgb,var(--text-inv)_14%,transparent)]" onClick={() => { if (done.current) return; close(); toast.action?.onAction(); }}>{t(toast.action.label)}</button>}
    <IconButton size="xs" aria-label={t("Dismiss")} disabled={exiting} style={{ color: 'inherit' }} className="opacity-60" onClick={close}><Icon name="x" size={13} /></IconButton>
  </div>;
}
export interface ToastViewportProps { items: readonly ToastMessage[]; onDismiss: (id: string) => void; maxVisible?: number }
export function ToastViewport({ items, onDismiss, maxVisible = 3 }: ToastViewportProps) { const t = useUiTranslation(); return <Portal><div data-overlay-notification="" aria-label={t("Notifications")} className="ui-toast-viewport pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2">{items.slice(0, maxVisible).map(toast => <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />)}</div></Portal>; }
