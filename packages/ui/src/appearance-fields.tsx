import { useUiTranslation } from './translation-context';
import { Icon } from './icons';
import type { IconName } from './icon-paths';
export interface AppearanceFieldsProps<T extends IconName> {
  icons: readonly T[];
  colors: readonly { id: string; color: string }[];
  icon: IconName;
  color: string;
  disabled?: boolean;
  onIconChange: (icon: T) => void;
  onColorChange: (color: string) => void;
}
export function AppearanceFields<T extends IconName>({
  icons,
  colors,
  icon,
  color,
  disabled,
  onIconChange,
  onColorChange,
}: AppearanceFieldsProps<T>) {
  const t = useUiTranslation();
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex min-w-[220px] flex-1 flex-col gap-[6px]">
        <span className="text-sm font-medium">{t('Icon')}</span>
        <div role="radiogroup" aria-label={t('Icon')} className="grid grid-cols-8 gap-1">
          {icons.map((value) => (
            <button
              key={value}
              disabled={disabled}
              type="button"
              role="radio"
              aria-label={value}
              aria-checked={icon === value}
              className={`grid h-8 place-items-center rounded-sm border border-solid ${icon === value ? 'border-accent bg-accent-soft text-accent' : 'border-transparent text-secondary source-hover:bg-surface-2'}`}
              onClick={() => onIconChange(value)}
            >
              <Icon name={value} size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-[6px]">
        <span className="text-sm font-medium">{t('Color')}</span>
        <div
          role="radiogroup"
          aria-label={t('Color')}
          className="flex max-w-[140px] flex-wrap gap-2"
        >
          {colors.map((value) => (
            <button
              key={value.id}
              disabled={disabled}
              type="button"
              role="radio"
              aria-label={value.id}
              aria-checked={color === value.color}
              className="grid size-[22px] place-items-center rounded-[50%] text-[#fff] [transition:transform_var(--dur)] source-hover:[transform:scale(1.08)]"
              style={{
                background: value.color,
                boxShadow:
                  color === value.color
                    ? `0 0 0 2px var(--surface), 0 0 0 4px ${value.color}`
                    : '0 0 0 1px rgba(0,0,0,.08)',
              }}
              onClick={() => onColorChange(value.color)}
            >
              {color === value.color && <Icon name="check" size={12} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
