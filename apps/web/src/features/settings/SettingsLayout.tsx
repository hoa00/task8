import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { Outlet, Link, useLocation, useRouter } from '@tanstack/react-router';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@studio/ui';
import type { IconName } from '@studio/ui';
import { links } from '../../app/navigation';
import { useWorkspaceId } from '../../app/shell/workspace-context';
export type SettingsSection = Parameters<typeof links.settings>[1];
const settingsNavigation: readonly {
  group: string;
  items: readonly [SettingsSection, string, IconName][];
}[] = [
  {
    group: 'General',
    items: [
      ['workspace', 'Workspace', 'building-2'],
      ['appearance', 'Appearance', 'palette'],
      ['language', 'Language', 'languages'],
      ['datetime', 'Date & time', 'clock'],
    ],
  },
  {
    group: 'Workspace',
    items: [
      ['members', 'Members', 'users'],
      ['teams', 'Teams', 'users-round'],
      ['projects', 'Projects', 'folder-kanban'],
      ['permissions', 'Permissions', 'shield'],
    ],
  },
  {
    group: 'Notifications',
    items: [
      ['notif-email', 'Email', 'mail'],
      ['notif-push', 'Push', 'smartphone'],
      ['notif-mentions', 'Mentions', 'at-sign'],
      ['notif-assign', 'Task assignments', 'user-check'],
    ],
  },
  {
    group: 'Personal',
    items: [
      ['profile', 'Profile', 'user'],
      ['preferences', 'Preferences', 'sliders-horizontal'],
      ['shortcuts', 'Keyboard shortcuts', 'keyboard'],
    ],
  },
  {
    group: 'Security',
    items: [
      ['password', 'Password', 'key-round'],
      ['sessions', 'Sessions', 'monitor-smartphone'],
      ['2fa', 'Two-factor authentication', 'shield-check'],
    ],
  },
  {
    group: 'Billing',
    items: [
      ['plan', 'Plan', 'gem'],
      ['payment', 'Payment', 'credit-card'],
      ['invoices', 'Invoices', 'receipt'],
    ],
  },
];
export function SettingsLayout() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    path = useLocation({ select: (value) => value.pathname });
  const router = useRouter(),
    renderedPath = useRef(path);
  const navRef = useRef<HTMLElement>(null),
    bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(
    () =>
      router.subscribe('onRendered', ({ toLocation }) => {
        if (renderedPath.current === toLocation.pathname) return;
        renderedPath.current = toLocation.pathname;
        // Reset after Router restores nested containers; Source recreates each section.
        bodyRef.current?.scrollTo(0, 0);
        navRef.current?.scrollTo(0, 0);
      }),
    [router],
  );
  return (
    <div
      data-settings-layout
      className="grid h-full grid-cols-[220px_minmax(0,1fr)] source-tablet:grid-cols-[minmax(0,1fr)] source-tablet:grid-rows-[auto_minmax(0,1fr)]"
    >
      <nav
        key={`nav:${path}`}
        ref={navRef}
        aria-label={t('Settings')}
        data-settings-nav
        className="overflow-y-auto border-0 border-r border-solid border-border bg-surface px-[10px] py-5 source-tablet:flex source-tablet:gap-1 source-tablet:overflow-x-auto source-tablet:border-b source-tablet:border-r-0 source-tablet:px-3 source-tablet:py-2"
      >
        {settingsNavigation.map(({ group, items }, index) => (
          <div className="contents" key={group}>
            <div
              className={`${index ? 'pt-[14px]' : 'pt-0'} px-2 pb-1 text-2xs font-semibold uppercase tracking-[.06em] text-muted source-tablet:hidden`}
            >
              {t(group)}
            </div>
            {items.map(([section, label, icon]) => (
              <Link
                key={section}
                to={links.settings(workspaceId, section)}
                aria-current={path === links.settings(workspaceId, section) ? 'page' : undefined}
                className="relative flex h-[var(--side-row)] w-full shrink-0 items-center gap-[9px] whitespace-nowrap rounded-sm px-2 text-left text-body font-[450] text-secondary transition-[background,color] source-hover:bg-surface-3 source-hover:text-foreground aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:[box-shadow:0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_var(--border)] source-dark:aria-[current=page]:bg-surface-3 source-dark:aria-[current=page]:shadow-none source-tablet:w-auto"
              >
                <Icon
                  name={icon}
                  size={15}
                  className={
                    path === links.settings(workspaceId, section) ? 'text-secondary' : 'text-faint'
                  }
                />
                <span>{t(label)}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div key={`body:${path}`} ref={bodyRef} data-settings-body className="overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
export interface SectionHeadingProps {
  title: string;
  lead: string;
}
export function SectionHeading({ title, lead }: SectionHeadingProps) {
  useTranslation();
  return (
    <>
      <h1 className="mb-1 mt-0 text-xl font-semibold tracking-[-.015em]">
        {typeof title === 'string' ? t(title) : title}
      </h1>
      <p className="mb-6 mt-0 text-secondary">{t(lead)}</p>
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
  useTranslation();
  return (
    <div data-settings-block className={`mt-7 ${className}`}>
      {title && (
        <h2
          className={`mb-1 mt-0 border-0 border-b border-solid border-border pb-2 text-body font-semibold ${danger ? 'text-red' : ''}`}
        >
          {typeof title === 'string' ? t(title) : title}
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
  useTranslation();
  return (
    <div
      data-setting-row
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-0 border-b border-solid border-divider py-[14px] source-mobile:grid-cols-[minmax(0,1fr)] ${className}`}
    >
      <div>
        <div className="text-body font-medium">{typeof title === 'string' ? t(title) : title}</div>
        {description && (
          <div className="mt-[2px] text-sm text-secondary">
            {typeof description === 'string' ? t(description) : description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
