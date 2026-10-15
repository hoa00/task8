import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useRef, useState } from 'react';
import { Icon, Menu, MenuItem } from '@studio/ui';
import type { DirectoryMember } from '../../data/people-demo';
export interface RolePickerProps {
  member: DirectoryMember;
  readonly?: boolean;
  disabled?: boolean;
  onChange: (role: 'Admin' | 'Member' | 'Guest') => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  anchor?: HTMLElement | null;
}
const descriptions = {
  Admin: 'Manage members, settings, and all projects',
  Member: 'Create projects and work on tasks',
  Guest: 'Only sees projects they are invited to',
};
export function RolePicker({
  member,
  readonly = false,
  disabled = false,
  onChange,
  open: controlled,
  onOpenChange,
  anchor,
}: RolePickerProps) {
  useTranslation();
  const ref = useRef<HTMLButtonElement>(null),
    [local, setLocal] = useState(false),
    open = controlled ?? local,
    change = (value: boolean) => {
      setLocal(value);
      onOpenChange?.(value);
    };
  return (
    <>
      <button
        ref={ref}
        className={`inline-flex h-[var(--h-sm)] max-w-full items-center gap-[6px] whitespace-nowrap rounded-sm px-[7px] text-sm text-foreground transition-colors duration-source ${readonly ? '' : 'border border-solid border-border source-hover:bg-surface-2'}`}
        disabled={disabled || readonly}
        aria-label={t('Role for {{value1}}', { value1: String(member.name) })}
        onClick={() => change(true)}
      >
        {member.role === 'Owner' && <Icon name="crown" size={13} />} {t(member.role)}
        {!readonly && <Icon name="chevron-down" size={12} />}
      </button>
      <Menu
        open={open}
        anchor={anchor ? { current: anchor } : ref}
        onOpenChange={change}
        label={t('Role for {{value1}}', { value1: String(member.name) })}
        className="people-menu w-[300px]!"
      >
        <div className="px-2 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[.06em] text-muted">
          {t('Role for')} {member.name}
        </div>
        {(['Admin', 'Member', 'Guest'] as const).map((role) => (
          <MenuItem
            key={role}
            className="h-auto! items-start! px-2! py-[7px]!"
            shortcut={
              member.role === role ? (
                <Icon name="check" size={14} className="text-secondary" />
              ) : undefined
            }
            onSelect={() => {
              change(false);
              onChange(role);
            }}
            disabled={disabled || readonly}
          >
            <span className="flex-1 whitespace-normal">
              <span className="block font-medium">{t(role)}</span>
              <span className="block text-[11.5px] text-muted">{t(descriptions[role])}</span>
            </span>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
