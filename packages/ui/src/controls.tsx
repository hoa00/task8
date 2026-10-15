import { useChoiceGroup } from './choice-group';
import { useUiTranslation } from './translation-context';
import { useId, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Icon } from './icons';

export type ControlSize = 'xs' | 'sm' | 'md' | 'lg';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost';
const buttonSizes = {
  xs: 'h-control-xs px-2 text-xs',
  sm: 'h-control-sm px-2 text-xs',
  md: 'h-control-md px-[11px] text-sm',
  lg: 'h-control-lg px-[14px] text-body',
};
const buttonVariants = {
  primary:
    'border-transparent bg-accent text-on-accent [box-shadow:inset_0_-1px_0_rgba(0,0,0,0.12)] source-hover:bg-[color-mix(in_srgb,var(--accent)_88%,var(--text))] active:bg-[color-mix(in_srgb,var(--accent)_78%,var(--text))]',
  secondary:
    'bg-surface border-border-strong text-foreground [box-shadow:var(--shadow-sm)] source-hover:bg-surface-2 active:bg-surface-3',
  ghost:
    'border-transparent text-secondary source-hover:bg-surface-2 source-hover:text-foreground active:bg-surface-3 active:text-foreground aria-pressed:bg-surface-3 aria-pressed:text-foreground',
  danger:
    'border-transparent bg-red text-[#fff] source-hover:bg-[color-mix(in_srgb,var(--red)_88%,#000)]',
  dangerGhost: 'border-transparent text-red source-hover:bg-red-soft',
};
export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  block?: boolean;
}
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  block = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      data-variant={variant}
      className={`relative inline-flex items-center justify-center gap-[6px] rounded-sm border border-solid font-medium whitespace-nowrap select-none transition-[background,border-color,color,box-shadow,transform] ease-[ease] enabled:active:[transform:scale(0.97)] source-reduce:enabled:active:transform-none [&_svg]:opacity-90 ${buttonSizes[size]} ${buttonVariants[variant]} ${block ? 'w-full' : ''} ${disabled && !loading ? 'opacity-45 pointer-events-none disabled:[box-shadow:none]' : ''} ${loading ? 'ui-button-loading pointer-events-none text-transparent' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
const iconSizes = {
  xs: 'size-control-xs rounded-xs',
  sm: 'size-control-sm rounded-sm',
  md: 'size-control-md rounded-sm',
  lg: 'size-control-lg rounded-sm',
};
export interface IconButtonProps extends ComponentPropsWithRef<'button'> {
  'aria-label': string;
  size?: ControlSize;
}
export function IconButton({
  size = 'md',
  type = 'button',
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`relative inline-flex shrink-0 items-center justify-center text-secondary transition-[background,color] source-hover:bg-surface-2 source-hover:text-foreground active:bg-surface-3 active:text-foreground aria-pressed:bg-surface-3 aria-pressed:text-foreground disabled:opacity-40 disabled:pointer-events-none ${iconSizes[size]} ${className}`}
    />
  );
}
const inputSizes = {
  xs: 'h-control-xs',
  sm: 'h-control-sm text-sm',
  md: 'h-control-md',
  lg: 'h-control-lg',
};
const inputClasses =
  'w-full rounded-sm border border-solid border-border-strong bg-surface px-[10px] text-body transition-[border-color,box-shadow] placeholder:text-muted source-hover:not-aria-invalid:border-[color-mix(in_srgb,var(--border-strong)_60%,var(--text-3))] focus:not-aria-invalid:border-accent focus:not-aria-invalid:[box-shadow:0_0_0_3px_var(--accent-soft)] focus:outline-none disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed aria-invalid:border-red aria-invalid:[box-shadow:0_0_0_3px_var(--red-soft)]';
export interface InputProps
  extends Omit<ComponentPropsWithRef<'input'>, 'size' | 'value' | 'defaultValue'> {
  value: string;
  size?: ControlSize;
  error?: boolean;
}
export function Input({ size = 'md', error, className = '', ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={error || props['aria-invalid']}
      className={`${inputClasses} py-0 ${inputSizes[size]} ${className}`}
    />
  );
}
export interface TextareaProps
  extends Omit<ComponentPropsWithRef<'textarea'>, 'value' | 'defaultValue'> {
  value: string;
  error?: boolean;
}
export function Textarea({ error, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      aria-invalid={error || props['aria-invalid']}
      className={`${inputClasses} min-h-[72px] resize-y px-[10px] py-2 leading-[1.5] ${className}`}
    />
  );
}
export interface FieldControlProps {
  id: string;
  'aria-invalid'?: true | undefined;
  'aria-describedby'?: string | undefined;
  'aria-labelledby': string;
  'aria-errormessage'?: string | undefined;
}
export interface FieldProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  controlId?: string;
  children: (props: FieldControlProps) => ReactNode;
}
export function Field({
  label,
  hint,
  error,
  controlId,
  children,
  className = '',
  ...props
}: FieldProps) {
  const generatedId = useId();
  const id = controlId ?? generatedId;
  const descriptionId = `${id}-description`,
    labelId = `${id}-label`;
  return (
    <div {...props} className={`flex flex-col gap-[6px] ${className}`}>
      <label id={labelId} htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children({
        id,
        'aria-labelledby': labelId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? descriptionId : undefined,
        'aria-errormessage': error ? descriptionId : undefined,
      })}
      {error ? (
        <span id={descriptionId} className="flex items-center gap-1 text-xs text-red">
          <Icon name="circle-alert" size={12} />
          {error}
        </span>
      ) : hint ? (
        <span id={descriptionId} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
export interface FieldGroupProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}
export function FieldGroup({
  label,
  children,
  hint,
  error,
  className = '',
  ...props
}: FieldGroupProps) {
  const id = useId(),
    descriptionId = `${id}-description`;
  return (
    <div
      {...props}
      role="group"
      aria-labelledby={id}
      aria-describedby={error || hint ? descriptionId : undefined}
      className={`flex flex-col gap-[6px] ${className}`}
    >
      <span id={id} className="text-sm font-medium text-foreground">
        {label}
      </span>
      {children}
      {(error || hint) && (
        <span id={descriptionId} className={error ? 'text-xs text-red' : 'text-xs text-muted'}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
export type PasswordInputProps = Omit<InputProps, 'type'> &
  (
    | { revealControl: false; revealed?: never; onRevealedChange?: never }
    | { revealControl?: true; revealed: boolean; onRevealedChange: (revealed: boolean) => void }
  );
export function PasswordInput({
  revealed,
  onRevealedChange,
  revealControl = true,
  className = '',
  ...props
}: PasswordInputProps) {
  const t = useUiTranslation();
  if (!revealControl) return <Input {...props} type="password" className={className} />;
  return (
    <div className="relative flex items-center">
      <Input
        {...props}
        type={revealed ? 'text' : 'password'}
        className={`pl-[30px] pr-[38px] ${className}`}
      />
      <span className="absolute right-[5px]">
        <IconButton
          size="sm"
          disabled={props.disabled}
          aria-label={revealed ? t('Hide password') : t('Show password')}
          aria-pressed={revealed}
          onClick={() => onRevealedChange?.(!revealed)}
        >
          <Icon name={revealed ? 'eye-off' : 'eye'} size={15} />
        </IconButton>
      </span>
    </div>
  );
}
export interface CheckboxProps
  extends Omit<
    ComponentPropsWithRef<'input'>,
    'type' | 'checked' | 'defaultChecked' | 'onChange' | 'size'
  > {
  checked: boolean;
  indeterminate?: boolean;
  round?: boolean;
  onCheckedChange: (checked: boolean) => void;
}
export function Checkbox({
  checked,
  indeterminate = false,
  round = false,
  onCheckedChange,
  ref,
  className = '',
  ...props
}: CheckboxProps) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  useLayoutEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate;
  }, [indeterminate, checked]);
  return (
    <input
      {...props}
      ref={input}
      type="checkbox"
      checked={checked}
      aria-checked={indeterminate ? 'mixed' : checked}
      data-mixed={indeterminate || undefined}
      onChange={(event) => {
        event.target.indeterminate = indeterminate;
        onCheckedChange(event.target.checked);
      }}
      className={`m-0 inline-grid shrink-0 appearance-none place-content-center border-[1.5px] border-solid border-border-strong bg-surface transition-[background,border-color] source-hover:not-checked:not-indeterminate:border-faint checked:border-accent checked:bg-accent indeterminate:border-accent indeterminate:bg-accent disabled:cursor-not-allowed ${round ? 'size-4 rounded-[50%]' : 'size-[15px] rounded-[4px]'} ui-checkbox ${className}`}
    />
  );
}
export type ToggleProps = Omit<CheckboxProps, 'indeterminate' | 'round'>;
export function Toggle({ checked, onCheckedChange, className = '', ...props }: ToggleProps) {
  return (
    <input
      {...props}
      type="checkbox"
      role="switch"
      checked={checked}
      aria-checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
      className={`relative m-0 h-[18px] w-[30px] shrink-0 cursor-pointer appearance-none rounded-[9px] bg-border-strong transition-[background] checked:bg-accent disabled:cursor-not-allowed ui-toggle ${className}`}
    />
  );
}
export interface ChoiceItem {
  ariaLabel?: string;
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  count?: number | undefined;
  disabled?: boolean;
  panelId?: string;
}
export interface TabsProps extends Omit<ComponentPropsWithRef<'div'>, 'onChange'> {
  items: readonly ChoiceItem[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
}
export interface SegmentedControlProps extends TabsProps {
  semantics?: 'radio' | 'tabs';
}
function Choices({
  items,
  value,
  onValueChange,
  label,
  segmented,
  semantics,
  ref,
  className = '',
  ...props
}: SegmentedControlProps & { segmented: boolean }) {
  const tabs = !segmented || semantics === 'tabs';
  const { rootRef: root, getItemProps } = useChoiceGroup({ items, value, onValueChange });
  useImperativeHandle(ref, () => root.current!, [root]);
  return (
    <div
      {...props}
      ref={root}
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={`${segmented ? 'inline-flex gap-[2px] rounded-sm bg-surface-3 p-[2px]' : 'flex gap-[2px] overflow-x-auto border-0 border-b border-solid border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'} ${className}`}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-label={item.ariaLabel}
          role={tabs ? 'tab' : 'radio'}
          aria-checked={!tabs ? value === item.value : undefined}
          aria-selected={tabs ? value === item.value : undefined}
          aria-controls={item.panelId}
          {...getItemProps(item.value)}
          className={`${segmented ? 'h-[calc(var(--h-sm)-2px)] gap-[5px] rounded-[5px] px-[9px] text-xs transition-[background,color] aria-checked:bg-surface aria-checked:text-foreground aria-checked:[box-shadow:0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)] aria-selected:bg-surface aria-selected:text-foreground aria-selected:[box-shadow:0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]' : 'relative h-9 gap-[6px] whitespace-nowrap px-[10px] text-sm transition-colors aria-selected:text-foreground ui-tab'} inline-flex items-center font-medium text-secondary source-hover:text-foreground`}
        >
          {item.icon}
          {item.label}
          {item.count !== undefined && (
            <span className="text-2xs font-medium text-muted">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
export function Tabs(props: TabsProps) {
  return <Choices {...props} segmented={false} />;
}
export function SegmentedControl(props: SegmentedControlProps) {
  return <Choices {...props} segmented />;
}
export type VisuallyHiddenProps = ComponentPropsWithRef<'span'>;
export function VisuallyHidden(props: VisuallyHiddenProps) {
  return <span {...props} className={`sr-only ${props.className ?? ''}`} />;
}
