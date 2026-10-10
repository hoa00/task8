import { createElement } from 'react';
import { iconPaths } from './icon-paths';
import type { IconName } from './icon-paths';
import { logoPath } from './logo-path';

export interface IconProps { name: IconName; size?: number; className?: string }
export function Icon({ name, size = 16, className = '' }: IconProps) {
  return <svg className={`block shrink-0 ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {iconPaths[name].map(([tag, attributes], index) => createElement(tag, { ...attributes, key: index }))}
  </svg>;
}
export type StatusGlyph = 'backlog' | 'todo' | 'progress' | 'review' | 'done';
export interface TaskStatusIconProps { status: StatusGlyph; size?: number }
export function TaskStatusIcon({ status, size = 14 }: TaskStatusIconProps) {
  const color = `var(--st-${status})`;
  return <svg className="shrink-0" width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
    {status === 'done' ? <><circle cx="7" cy="7" r="6.2" fill={color} /><path d="M4.4 7.2 6.2 9 9.7 5.3" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></> : <>
      <circle cx="7" cy="7" r="5.4" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={status === 'backlog' ? '1.9 2.1' : undefined} />
      {status === 'progress' && <path d="M7 3.4A3.6 3.6 0 0 1 7 10.6Z" fill={color} />}
      {status === 'review' && <path d="M7 3.4A3.6 3.6 0 1 1 3.4 7L7 7Z" fill={color} />}
    </>}
  </svg>;
}
export type PriorityGlyph = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export interface PriorityIconProps { priority: PriorityGlyph; size?: number }
export function PriorityIcon({ priority, size = 14 }: PriorityIconProps) {
  const weight = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 }[priority];
  return <svg className="shrink-0" width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
    {priority === 'urgent' ? <><rect x="1" y="1" width="12" height="12" rx="3" fill="var(--red)" /><path d="M7 3.8v4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" /><circle cx="7" cy="10.1" r=".95" fill="#fff" /></> : priority === 'none' ? <path d="M2.5 7h2M6 7h2M9.5 7h2" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" /> : [4.5, 7.5, 10.5].map((height, index) => <rect key={height} x={[1.8, 5.7, 9.6][index]} y={12 - height} width="2.6" height={height} rx="1" fill={weight >= index + 1 ? 'var(--text-2)' : 'var(--border-strong)'} />)}
  </svg>;
}
export interface LogoProps { height?: number }
export function Logo({ height = 22 }: LogoProps) {
  return <svg className="block shrink-0" height={height} width={Math.round(height * 241.47 / 102.27)} viewBox="45.53 114.5 241.47 102.27" role="img" aria-label="Gr8r"><path d={logoPath} fill="currentColor" /></svg>;
}
export interface BrandMarkProps { size?: number }
export function BrandMark({ size = 22 }: BrandMarkProps) {
  return <svg width={size} height={size} viewBox="0 0 332 332" aria-hidden="true"><rect width="332" height="332" fill="#000" /><path d={logoPath} fill="#fff" /></svg>;
}
