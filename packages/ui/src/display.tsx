import { useUiTranslation } from './translation-context';
import { createElement, Fragment } from 'react';
import type { ComponentPropsWithRef, CSSProperties, ReactNode } from 'react';
import { Icon } from './icons';
import type { IconName } from './icon-paths';
export type Tone = 'neutral' | 'accent' | 'green' | 'amber' | 'red' | 'violet';
const badgeTones = {
  neutral: 'bg-surface-2 text-secondary border-border', accent: 'bg-accent-soft text-accent border-transparent',
  green: 'bg-green-soft text-green border-transparent', amber: 'bg-amber-soft text-amber border-transparent',
  red: 'bg-red-soft text-red border-transparent', violet: 'bg-[color-mix(in_srgb,var(--violet)_11%,transparent)] text-violet border-transparent',
};
export interface BadgeProps extends ComponentPropsWithRef<'span'> { tone?: Tone; dot?: boolean }
export function Badge({ tone = 'neutral', dot, className = '', children, ...props }: BadgeProps) {
  return <span {...props} className={`inline-flex h-5 items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-solid px-[7px] text-xs font-medium ${badgeTones[tone]} ${className}`}>{dot && <span className="size-[6px] rounded-[50%] bg-current" />}{children}</span>;
}
export interface ColorDotProps extends ComponentPropsWithRef<'span'> { color: string }
export function ColorDot({ color, style, className = '', ...props }: ColorDotProps) { return <span {...props} className={`inline-block size-[6px] shrink-0 rounded-[50%] ${className}`} style={{ ...style, background: color }} />; }
export interface AvatarBaseProps extends ComponentPropsWithRef<'span'> { label: string; initials?: string; color?: string; size?: 'sm' | 'base' | 'md' | 'lg' | 'xl'; empty?: boolean; presence?: boolean }
const avatarSizes = { sm: 20, base: 22, md: 26, lg: 36, xl: 64 };
export function AvatarBase({ label, initials, color = 'var(--gray)', size = 'base', empty, presence, style, className = '', children, ...props }: AvatarBaseProps) {
  const pixels = avatarSizes[size];
  return <span {...props} role="img" aria-label={label} className={`relative inline-grid shrink-0 select-none place-items-center rounded-[50%] font-semibold leading-none tracking-[0.01em] ${empty ? 'border-[1.3px] border-dashed border-border-strong bg-transparent text-faint' : 'bg-[color-mix(in_srgb,var(--avatar-color)_17%,var(--surface))] text-[color-mix(in_srgb,var(--avatar-color)_55%,var(--text))] [box-shadow:0_0_0_1.5px_var(--surface)]'} ${className}`} style={{ ...style, '--avatar-color': color, width: pixels, height: pixels, fontSize: pixels * .4 } as CSSProperties}>{empty ? <Icon name="user" size={11} /> : children ?? initials}{presence && <span className="absolute -right-px -bottom-px size-[30%] rounded-[50%] bg-green [box-shadow:0_0_0_2px_var(--surface)]" />}</span>;
}
export interface AvatarStackBaseProps extends ComponentPropsWithRef<'span'> { avatars: readonly AvatarBaseProps[]; max?: number; size?: AvatarBaseProps['size']; overflowClassName?: string; renderAvatar?: (avatar: AvatarBaseProps) => ReactNode }
export function AvatarStackBase({ avatars, max = 4, size = 'sm', overflowClassName, renderAvatar, className = '', ...props }: AvatarStackBaseProps) {
  const limit = Math.max(0, Math.floor(max));
  return <span {...props} className={`inline-flex [&_span[role=img]+span[role=img]]:-ml-[5px] ${className}`}>{avatars.slice(0, limit).map((avatar, index) => <Fragment key={index}>{renderAvatar ? renderAvatar({ ...avatar, size }) : <AvatarBase {...avatar} size={size} />}</Fragment>)}{avatars.length > limit && <AvatarBase label={`${avatars.length - limit} more`} initials={`+${avatars.length - limit}`} size={size} className={overflowClassName} />}</span>;
}
export type PanelProps = ComponentPropsWithRef<'section'>;
export function Panel({ className = '', ...props }: PanelProps) { return <section {...props} className={`rounded-lg border border-solid border-border bg-surface ${className}`} />; }
export interface PanelHeaderProps extends ComponentPropsWithRef<'div'> { heading?: ReactNode; actions?: ReactNode }
export function PanelHeader({ heading, actions, children, className = '', ...props }: PanelHeaderProps) {
  return <div {...props} className={`flex items-center gap-2 px-[14px] pt-3 pb-[10px] ${className}`}>{heading !== undefined && <h2 className="m-0 text-body font-semibold">{heading}</h2>}{children}{actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}</div>;
}
export type PanelBodyProps = ComponentPropsWithRef<'div'>;
export function PanelBody({ className = '', ...props }: PanelBodyProps) { return <div {...props} className={`px-[14px] pb-[14px] ${className}`} />; }
const progressTones = { accent: 'bg-accent', green: 'bg-green', amber: 'bg-amber', red: 'bg-red' };
export interface ProgressProps extends Omit<ComponentPropsWithRef<'span'>, 'children'> { value: number; label: string; tone?: keyof typeof progressTones }
export function Progress({ value, label, tone = 'accent', className = '', ...props }: ProgressProps) {
  const current = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return <span {...props} role="progressbar" aria-label={label} aria-valuenow={current} aria-valuemin={0} aria-valuemax={100} className={`h-1 min-w-10 flex-1 overflow-hidden rounded-[4px] bg-surface-3 ${className}`}><i className={`block h-full w-full origin-left rounded-[4px] transition-transform duration-[.3s] ease-source ${progressTones[tone]}`} style={{ transform: `scaleX(${current / 100})` }} /></span>;
}
export interface StackedBarProps extends ComponentPropsWithRef<'span'> { segments: readonly { value: number; color: string }[]; label: string }
export function StackedBar({ segments, label, className = '', ...props }: StackedBarProps) {
  return <span {...props} role="img" aria-label={label} className={`flex h-[6px] gap-[2px] overflow-hidden rounded-[6px] bg-surface-3 ${className}`}>{segments.map((segment, index) => <i key={index} className="block h-full" style={{ width: `${Math.max(0, Math.min(100, segment.value))}%`, background: segment.color }} />)}</span>;
}
export function Meter({ value, label, tone = 'accent', className = '', ...props }: ProgressProps) {
  const current = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return <span {...props} role="meter" aria-label={label} aria-valuenow={current} aria-valuemin={0} aria-valuemax={100} className={`block h-[6px] overflow-hidden rounded-[3px] bg-surface-3 ${className}`}><i className={`block h-full ${progressTones[tone]}`} style={{ width: `${current}%` }} /></span>;
}
export interface AlertProps extends ComponentPropsWithRef<'div'> { tone?: 'neutral' | 'info' | 'ok' | 'warn' | 'danger'; icon?: IconName }
const alertTones = { neutral: 'bg-surface border-border', info: 'bg-accent-soft border-transparent [&_svg]:text-accent', ok: 'bg-green-soft border-transparent [&_svg]:text-green', warn: 'bg-amber-soft border-transparent [&_svg]:text-amber', danger: 'bg-red-soft border-transparent [&_svg]:text-red' };
export function Alert({ tone = 'neutral', icon, children, className = '', role, ...props }: AlertProps) { const t = useUiTranslation();
  return <div {...props} role={role ?? (tone === 'danger' ? 'alert' : 'status')} className={`flex items-start gap-[10px] rounded-default border border-solid px-3 py-[10px] text-sm [&_b]:font-semibold ${alertTones[tone]} ${className}`}>{icon && <Icon name={icon} size={15} className="mt-px" />}{Array.isArray(children) ? children.map(child => typeof child === "string" ? t(child) : child) : typeof children === "string" ? t(children) : children}</div>;
}
export interface EmptyStateProps extends ComponentPropsWithRef<'div'> { heading: string; description: ReactNode; icon: IconName; action?: ReactNode; size?: 'sm' | 'md'; error?: boolean; headingLevel?: 2 | 3 | 4 }
export function EmptyState({ heading, description, icon, action, size = 'md', error, headingLevel = 2, className = '', ...props }: EmptyStateProps) { const t = useUiTranslation();
  return <div {...props} className={`flex flex-col items-center gap-[6px] text-center ${error ? "text-red text-xs" : ''} ${size === 'sm' ? "px-4 py-7" : 'px-6 py-[56px]'} ${className}`}><div className={`mb-1 grid place-items-center ${error ? 'text-red' : 'text-faint'}`}><Icon name={icon} size={22} /></div>{createElement(`h${headingLevel}`, { className: 'm-0 text-md font-semibold' }, t(heading))}<p className="m-0 mb-[10px] max-w-[340px] text-sm text-secondary">{typeof description === "string" ? t(description) : description}</p>{action}</div>;
}
export interface SkeletonProps extends ComponentPropsWithRef<'span'> { width?: CSSProperties['width']; height?: CSSProperties['height'] }
export function Skeleton({ width = '100%', height = 12, style, className = '', ...props }: SkeletonProps) { return <span {...props} aria-hidden="true" className={`ui-skeleton block rounded-[5px] ${className}`} style={{ ...style, width, height }} />; }
export type KeyHintProps = ComponentPropsWithRef<'kbd'>;
export function KeyHint({ className = '', ...props }: KeyHintProps) { return <kbd {...props} className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-solid border-b-[1.5px] border-border bg-surface px-[5px] font-mono text-[11px] leading-none text-secondary ${className}`} />; }
