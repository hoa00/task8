import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentPropsWithRef } from 'react';
import { Icon } from './icons';
export interface SelectOption { value: string; label: string; disabled?: boolean }
export interface SelectProps extends Omit<ComponentPropsWithRef<'button'>, 'value' | 'onChange' | 'children'> { options: readonly SelectOption[]; value: string; onValueChange: (value: string) => void; label: string; name?: string; open?: boolean; onOpenChange?: (open: boolean) => void; error?: boolean }
export function Select({ options, value, onValueChange, label, name, open: controlledOpen, onOpenChange, error, disabled, ref, className = '', ...props }: SelectProps) {
  const trigger = useRef<HTMLButtonElement>(null); const menu = useRef<HTMLDivElement>(null); const listId = useId();
  const [internalOpen, setInternalOpen] = useState(false); const [position, setPosition] = useState({ left: 0, top: 0, minWidth: 160 });
  const open = !disabled && (controlledOpen ?? internalOpen);
  useImperativeHandle(ref, () => trigger.current!, []);
  const setOpen = (next: boolean, refocus = false) => { if (controlledOpen === undefined) setInternalOpen(next); onOpenChange?.(next); if (refocus) trigger.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const r = trigger.current.getBoundingClientRect(); const minWidth = Math.max(r.width, 160);
    menu.current.style.minWidth = `${minWidth}px`;
    const { width, height } = menu.current.getBoundingClientRect();
    setPosition({ minWidth, left: Math.max(8, Math.min(r.left, innerWidth - width - 8)), top: r.bottom + 4 + height > innerHeight - 8 ? Math.max(8, r.top - 4 - height) : r.bottom + 4 });
    (menu.current.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)') ?? menu.current.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => { if (controlledOpen === undefined) setInternalOpen(false); onOpenChange?.(false); };
    const outside = (event: Event) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) close(); };
    document.addEventListener('mousedown', outside, true); document.addEventListener('scroll', outside, true); window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', outside, true); document.removeEventListener('scroll', outside, true); window.removeEventListener('resize', close); };
  }, [open, controlledOpen, onOpenChange]);
  return <><input type="hidden" name={name} value={value} disabled={disabled} /><button {...props} ref={trigger} type="button" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-invalid={error || props['aria-invalid']} onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}
    className={`ui-select-trigger inline-flex h-control-md w-full min-w-0 cursor-pointer appearance-none items-center rounded-sm border border-solid border-border-strong bg-surface pl-[10px] pr-7 text-left text-body text-foreground transition-[border-color,box-shadow] source-hover:border-[color-mix(in_srgb,var(--border-strong)_60%,var(--text-3))] focus:border-accent focus:[box-shadow:0_0_0_3px_var(--accent-soft)] focus:outline-none aria-expanded:border-accent aria-expanded:[box-shadow:0_0_0_3px_var(--accent-soft)] aria-invalid:border-red aria-invalid:[box-shadow:0_0_0_3px_var(--red-soft)] disabled:cursor-not-allowed ${className}`}><span className="overflow-hidden text-ellipsis whitespace-nowrap">{options.find(option => option.value === value)?.label ?? ''}</span></button>
    {open && <div ref={menu} id={listId} role="listbox" aria-label={label} style={position} className="fixed z-[80] max-h-[min(420px,70vh)] max-w-[360px] origin-top-left overflow-y-auto rounded-lg bg-surface p-1 text-body [box-shadow:var(--shadow-pop)] animate-[ui-select-in_.16s_var(--ease)_both]" onMouseDown={event => event.preventDefault()} onKeyDown={event => {
      const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]; const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus(); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false, true); }
      else if (event.key === 'Tab') setOpen(false);
    }}>{options.map(option => <button key={option.value} type="button" role="option" aria-selected={value === option.value} disabled={option.disabled} onClick={() => { if (value !== option.value) onValueChange(option.value); setOpen(false, true); }} className="flex min-h-[30px] w-full items-center gap-[9px] whitespace-nowrap rounded-sm px-2 text-left text-body text-foreground aria-selected:font-medium source-hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-45 disabled:pointer-events-none"><span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{option.label}</span>{value === option.value && <span className="ml-auto text-accent"><Icon name="check" size={14} className="text-secondary" /></span>}</button>)}</div>}
  </>;
}
