import { useTranslation } from '../../i18n/useTranslation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '@studio/ui';
import type { IconName } from '@studio/ui';
import { useInitialRouteEntry } from '../../app/shell/route-entry-context';

export interface StatItemProps { label: string; value: number; suffix?: string; detail: ReactNode; icon?: IconName; tone?: 'red'; detailTone?: 'green' | 'red'; onClick?: () => void }
export function StatItem({ label, value, suffix = '', detail, icon, tone, detailTone, onClick }: StatItemProps) {
 const { t } = useTranslation();
 const initialRouteEntry = useInitialRouteEntry();
 const first = useRef(true), [shown, setShown] = useState(value), [running, setRunning] = useState(false), [startedAt, setStartedAt] = useState<number>();
 useEffect(() => {
  const initial = first.current;
  const motion = document.documentElement.dataset.motion, reduced = motion === 'reduce' || motion !== 'full' && matchMedia('(prefers-reduced-motion:reduce)').matches;
  if (!initial || initialRouteEntry || value < 2 || reduced) { first.current = false; setShown(value); setRunning(false); setStartedAt(undefined); return; }
  const start = performance.now(); let frame = 0; setStartedAt(start); setShown(0); setRunning(true);
  const step = (now: number) => { first.current = false; const k = Math.min(1, (now - start) / 520); setShown(Math.round(value * (1 - (1 - k) ** 3))); if (k < 1) frame = requestAnimationFrame(step); else setRunning(false); };
  frame = requestAnimationFrame(step); return () => cancelAnimationFrame(frame);
 }, [value, initialRouteEntry]);
 const content = <><span className="flex items-center gap-[6px] text-sm text-secondary">{icon && <Icon name={icon} size={14} />}{t(label)}</span><span data-metric={label} data-countup-state={running ? 'running' : 'ready'} data-countup-start={startedAt} data-metric-value={value} className={`text-[22px] font-semibold leading-[1.1] tracking-[-.02em] tabular-nums ${tone === 'red' ? 'text-red' : ''}`}>{shown}{suffix}</span><span className={`text-xs ${detailTone === 'red' ? 'text-red' : detailTone === 'green' ? 'text-green' : 'text-muted'}`}>{detail}</span></>;
 const className = 'dashboard-stat flex flex-col gap-[6px] px-4 py-[14px] text-left transition-colors duration-source source-hover:bg-surface-2';
 return onClick ? <button className={className} onClick={onClick}>{content}</button> : <div className={className}>{content}</div>;
}
export interface StatGroupProps { children: ReactNode }
export function StatGroup({ children }: StatGroupProps) { return <div className="mb-4 grid grid-cols-4 overflow-hidden rounded-lg border border-solid border-border source-tablet:grid-cols-2" data-dashboard-stats>{children}</div>; }
