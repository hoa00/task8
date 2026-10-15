import type { ReactNode } from 'react';
export interface SectionHeadingProps {
  title: string;
  lead: string;
}
export function SectionHeading({ title, lead }: SectionHeadingProps) {
  return (
    <>
      <h1 className="mb-1 mt-0 text-xl font-semibold tracking-[-.015em]">{title}</h1>
      <p className="mb-6 mt-0 text-secondary">{lead}</p>
    </>
  );
}
export interface SettingsBlockProps {
  title?: string;
  children: ReactNode;
  className?: string;
  danger?: boolean;
}
export function SettingsBlock({ title, children, className = '', danger }: SettingsBlockProps) {
  return (
    <div data-settings-block className={`mt-7 ${className}`}>
      {title && (
        <h2
          className={`mb-1 mt-0 border-0 border-b border-solid border-border pb-2 text-body font-semibold ${danger ? 'text-red' : ''}`}
        >
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
export interface SettingRowProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}
export function SettingRow({ title, description, children, className = '' }: SettingRowProps) {
  return (
    <div
      data-setting-row
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-0 border-b border-solid border-divider py-[14px] source-mobile:grid-cols-[minmax(0,1fr)] ${className}`}
    >
      <div>
        <div className="text-body font-medium">{title}</div>
        {description && <div className="mt-[2px] text-sm text-secondary">{description}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
