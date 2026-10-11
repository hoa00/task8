import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { labels } from '@studio/contracts/api';
import type { TaskDto } from '@studio/contracts/api';
export interface TaskStatusIconProps { status: TaskDto['status']; size?: number }
export function TaskStatusIcon({ status, size = 14 }: TaskStatusIconProps) {
  const color = `var(--st-${status})`;
  return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">{status === 'done' ? <><circle cx="7" cy="7" r="6.2" fill={color} /><path d="M4.4 7.2 6.2 9 9.7 5.3" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></> : <><circle cx="7" cy="7" r="5.4" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={status === 'backlog' ? '1.9 2.1' : undefined} />{status === 'progress' && <path d="M7 3.4A3.6 3.6 0 0 1 7 10.6Z" fill={color} />}{status === 'review' && <path d="M7 3.4A3.6 3.6 0 1 1 3.4 7L7 7Z" fill={color} />}</>}</svg>;
}
export interface PriorityIconProps { priority: TaskDto['priority']; size?: number }
export function PriorityIcon({ priority, size = 14 }: PriorityIconProps) {
  const weight = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 }[priority];
  return <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">{priority === 'urgent' ? <><rect x="1" y="1" width="12" height="12" rx="3" fill="var(--red)" /><path d="M7 3.8v4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /><circle cx="7" cy="10.1" r=".95" fill="#fff" /></> : priority === 'none' ? <path d="M2.5 7h2M6 7h2M9.5 7h2" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" /> : [[1.8, 4.5], [5.7, 7.5], [9.6, 10.5]].map(([x, height], index) => <rect key={x} x={x} y={12 - height!} width="2.6" height={height} rx="1" fill={weight >= index + 1 ? 'var(--text-2)' : 'var(--border-strong)'} />)}</svg>;
}
export function TaskLabel({ id }: { id: TaskDto['labelIds'][number] }) { useTranslation(); const label = labels.find(value => value.id === id)!; return <span className="inline-flex h-5 items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-solid border-border bg-surface pl-[6px] pr-[7px] text-xs text-secondary"><i className="size-[6px] rounded-[2px]" style={{ background: `var(--${label.colorToken})` }} />{t(label.name)}</span>; }
