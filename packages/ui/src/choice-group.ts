import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
export interface KeyboardChoice<T extends string> {
  value: T;
  disabled?: boolean;
}
export interface ChoiceItemInteraction {
  'data-choice-value': string;
  tabIndex: number;
  disabled: boolean;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}
export interface ChoiceGroupOptions<T extends string> {
  items: readonly KeyboardChoice<T>[];
  value: string;
  onValueChange: (value: T) => void;
}
// One keyboard owner for tabs, radio cards and swatches; presentation stays with
// each caller. Native buttons retain their single Enter/Space click behavior.
export function useChoiceGroup<T extends string>({
  items,
  value,
  onValueChange,
}: ChoiceGroupOptions<T>) {
  const rootRef = useRef<HTMLDivElement>(null),
    intendedFocus = useRef<T | null>(null);
  const enabled = items.filter((item) => !item.disabled),
    tabValue = enabled.find((item) => item.value === value)?.value ?? enabled[0]?.value;
  const buttonFor = (next: T) =>
    [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[data-choice-value]') ?? [])].find(
      (button) => button.dataset.choiceValue === next,
    );
  useLayoutEffect(() => {
    const next = intendedFocus.current;
    if (next === null) return;
    const button = buttonFor(next),
      active = document.activeElement;
    if (
      !items.some((item) => item.value === next) ||
      (active !== document.body && !rootRef.current?.contains(active))
    ) {
      intendedFocus.current = null;
      return;
    }
    if (
      button &&
      !button.disabled &&
      (active === document.body || active === button || rootRef.current?.contains(active))
    ) {
      button.focus({ preventScroll: true });
      intendedFocus.current = null;
    }
  });
  function getItemProps(next: T): ChoiceItemInteraction {
    const disabled = !!items.find((item) => item.value === next)?.disabled;
    function activate(target: T) {
      intendedFocus.current = target;
      onValueChange(target);
      buttonFor(target)?.focus({ preventScroll: true });
    }
    return {
      'data-choice-value': next,
      tabIndex: !disabled && next === tabValue ? 0 : -1,
      disabled,
      onClick: () => {
        if (!disabled) activate(next);
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) ||
          disabled ||
          !enabled.length
        )
          return;
        event.preventDefault();
        const index = enabled.findIndex((item) => item.value === next),
          target =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? enabled.length - 1
                : (index +
                    (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) +
                    enabled.length) %
                  enabled.length;
        const item = enabled[target];
        if (item) activate(item.value);
      },
    };
  }
  return { rootRef, getItemProps };
}
