import type { ChoiceItemInteraction } from '@studio/ui';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { Icon, SegmentedControl, Select, useChoiceGroup } from '@studio/ui';
import type { CSSProperties } from 'react';
import type { MemberPreferencesDto, UpdatePreferencesInput } from '@studio/contracts/api';
import { SettingRow, SettingsBlock } from './SettingsComponents';
const accentColors = [
  ['indigo', '#4B5BD6'],
  ['blue', '#2F6CD4'],
  ['violet', '#7348CC'],
  ['teal', '#1A7F7A'],
  ['rose', '#B93D68'],
  ['graphite', '#34332F'],
] as const;
const light = {
    bg: '#FBFAF8',
    side: '#F2F1EE',
    text: '#1D1C1A',
    border: '#E3E1DC',
    accent: '#4B5BD6',
  },
  dark = { bg: '#1D1D1C', side: '#151514', text: '#ECEAE5', border: '#333230', accent: '#8E9AF3' };
function Preview({ colors }: { colors: typeof light }) {
  useTranslation();
  return (
    <>
      <div className="flex flex-col gap-1 px-[6px] py-2" style={{ background: colors.side }}>
        {[70, 55, 80, 60].map((width, index) => (
          <i
            key={index}
            className="block h-[5px] rounded-[3px]"
            style={{ width: `${width}%`, background: index === 1 ? colors.accent : colors.border }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-[5px] p-[10px]" style={{ background: colors.bg }}>
        <i className="block h-[7px] w-[45%] rounded-[3px]" style={{ background: colors.text }} />
        <i className="block h-[5px] rounded-[3px]" style={{ background: colors.border }} />
        <i className="block h-[5px] w-[80%] rounded-[3px]" style={{ background: colors.border }} />
        <i
          className="mt-1 block h-[10px] w-[30%] rounded-[3px]"
          style={{ background: colors.accent }}
        />
      </div>
    </>
  );
}
export interface ThemePreviewCardProps {
  value: MemberPreferencesDto['theme'];
  selected: boolean;
  interaction: ChoiceItemInteraction;
}
export function ThemePreviewCard({ value, selected, interaction }: ThemePreviewCardProps) {
  useTranslation();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      {...interaction}
      className={`flex flex-col gap-2 rounded-lg border border-solid p-2 text-left transition-[border-color,box-shadow] source-hover:border-border-strong ${selected ? 'border-accent! [box-shadow:0_0_0_3px_var(--accent-soft)]' : 'border-border'}`}
    >
      <div
        className={`grid h-[84px] overflow-hidden rounded-[6px] border border-solid border-[rgba(128,128,128,.2)] ${value === 'system' ? 'grid-cols-2' : 'grid-cols-[30%_1fr]'}`}
      >
        {value === 'system' ? (
          <>
            <div className="grid grid-cols-[30%_1fr]">
              <Preview colors={light} />
            </div>
            <div className="grid grid-cols-[30%_1fr]">
              <Preview colors={dark} />
            </div>
          </>
        ) : (
          <Preview colors={value === 'light' ? light : dark} />
        )}
      </div>
      <span className="flex items-center gap-[6px] text-[13px] font-medium">
        <Icon size={14} name={value === 'light' ? 'sun' : value === 'dark' ? 'moon' : 'monitor'} />
        {t(value[0]!.toUpperCase() + value.slice(1))}
        {selected && (
          <>
            <span className="flex-1" />
            <Icon name="circle-check" size={15} className="text-accent" />
          </>
        )}
      </span>
    </button>
  );
}
export interface AccentSwatchesProps {
  value: MemberPreferencesDto['accent'];
  disabled?: boolean;
  onSelect: (value: MemberPreferencesDto['accent']) => void;
}
export function AccentSwatches({ value, disabled, onSelect }: AccentSwatchesProps) {
  useTranslation();
  const { rootRef: choicesRef, getItemProps: choicesItemProps } = useChoiceGroup({
    items: accentColors.map(([value]) => ({ value, disabled: !!disabled })),
    value,
    onValueChange: onSelect,
  });
  return (
    <div
      ref={choicesRef}
      className="flex flex-wrap gap-2"
      role="radiogroup"
      aria-label={t('Accent color')}
    >
      {accentColors.map(([accent, color]) => (
        <button
          key={accent}
          type="button"
          role="radio"
          aria-label={accent}
          aria-checked={value === accent}
          {...choicesItemProps(accent)}
          style={{ '--swatch-color': color } as CSSProperties}
          className={`grid size-[26px] place-items-center rounded-full bg-[var(--swatch-color)] text-[#fff] transition-transform source-hover:scale-[1.08] ${value === accent ? '[box-shadow:0_0_0_2px_var(--surface),0_0_0_4px_var(--swatch-color)]' : '[box-shadow:0_0_0_1px_rgba(0,0,0,.08)]'}`}
        >
          {value === accent && <Icon name="check" size={13} />}
        </button>
      ))}
    </div>
  );
}
export interface AppearanceProps {
  preferences: MemberPreferencesDto;
  pending: boolean;
  onChange: (patch: UpdatePreferencesInput) => void;
}
export function Appearance({ preferences, pending, onChange }: AppearanceProps) {
  useTranslation();
  const { rootRef: themesRef, getItemProps: themesItemProps } = useChoiceGroup({
    items: (['light', 'dark', 'system'] as const).map((value) => ({ value, disabled: pending })),
    value: preferences.theme,
    onValueChange: (theme) => onChange({ theme }),
  });
  return (
    <>
      <SettingsBlock title={t('Theme')} className="mt-0!">
        <div
          ref={themesRef}
          role="radiogroup"
          aria-label={t('Theme')}
          className="mt-3 grid grid-cols-3 gap-3 source-mobile:grid-cols-[minmax(0,1fr)]"
        >
          {(['light', 'dark', 'system'] as const).map((value) => (
            <ThemePreviewCard
              key={value}
              value={value}
              selected={preferences.theme === value}
              interaction={themesItemProps(value)}
            />
          ))}
        </div>
      </SettingsBlock>
      <SettingsBlock title={t('Accent color')}>
        <SettingRow
          title={t('Accent')}
          description={t('Used for primary buttons, focus rings, and selection.')}
        >
          <AccentSwatches
            value={preferences.accent}
            disabled={pending}
            onSelect={(accent) => onChange({ accent })}
          />
        </SettingRow>
      </SettingsBlock>
      <SettingsBlock title={t('Density')}>
        <SettingRow
          title={t('Sidebar density')}
          description={t('Compact fits more projects on screen.')}
        >
          <DensitySelector
            label={t('Sidebar density')}
            value={preferences.side}
            disabled={pending}
            onChange={(side) => onChange({ side })}
          />
        </SettingRow>
        <SettingRow
          title={t('Task display')}
          description={t('Row height in lists and card padding on boards.')}
        >
          <DensitySelector
            label={t('Task display')}
            value={preferences.density}
            disabled={pending}
            onChange={(density) => onChange({ density })}
          />
        </SettingRow>
        <SettingRow
          title={t('Motion')}
          description={t('Reduce animations for drawers, modals, and transitions.')}
        >
          <Select
            label={t('Motion')}
            value={preferences.motion === 'reduce' ? 'reduce' : 'system'}
            options={[
              { value: 'system', label: t('Follow system') },
              { value: 'reduce', label: t('Reduce motion') },
            ]}
            disabled={pending}
            className="w-auto! min-w-[180px]"
            onValueChange={(motion) =>
              onChange({ motion: motion as MemberPreferencesDto['motion'] })
            }
          />
        </SettingRow>
      </SettingsBlock>
    </>
  );
}
export interface DensitySelectorProps {
  label: string;
  value: 'comfortable' | 'compact';
  disabled?: boolean;
  onChange: (value: 'comfortable' | 'compact') => void;
}
export function DensitySelector({ label, value, disabled, onChange }: DensitySelectorProps) {
  useTranslation();
  return (
    <SegmentedControl
      label={label}
      value={value}
      items={(['comfortable', 'compact'] as const).map((value) => ({
        value,
        label: t(value[0]!.toUpperCase() + value.slice(1)),
        disabled: !!disabled,
      }))}
      onValueChange={(value) => onChange(value as 'comfortable' | 'compact')}
    />
  );
}
