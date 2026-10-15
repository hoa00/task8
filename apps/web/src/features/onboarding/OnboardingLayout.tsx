import type { ChoiceItemInteraction } from '@studio/ui';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import type { ReactNode } from 'react';
import { Button, Icon } from '@studio/ui';
import type { IconName } from '@studio/ui';
import { AuthLayout } from '../auth/AuthLayout';

export function StepProgress({ step }: { step: number }) {
  useTranslation();
  return (
    <>
      <div
        data-step-progress
        className="mb-2 flex justify-center gap-[6px]"
        aria-label={t('Step {{value1}} of 6', { value1: String(step + 1) })}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <i
            data-current={index === step ? '' : undefined}
            key={index}
            className={`h-[3px] w-7 rounded-[2px] transition-[background] duration-200 ${index <= step ? 'bg-accent' : 'bg-border-strong'}`}
          />
        ))}
      </div>
      <div className="text-center text-[12px] text-muted">
        {t('Step')} {step + 1}
        {'  '}
        {t('of 6')}
      </div>
    </>
  );
}
export interface ChoiceCardProps {
  icon: IconName;
  title: string;
  subtitle: string;
  selected: boolean;
  interaction: ChoiceItemInteraction;
}
export function ChoiceCard({ icon, title, subtitle, selected, interaction }: ChoiceCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      {...interaction}
      className={`flex flex-col gap-2 rounded-lg border border-solid bg-surface px-3 py-[14px] text-left transition-[border-color,box-shadow,background] source-hover:border-border-strong ${selected ? 'border-accent [box-shadow:0_0_0_3px_var(--accent-soft)]' : 'border-border'}`}
    >
      <Icon name={icon} size={18} className={selected ? 'text-accent' : 'text-secondary'} />
      <b className="text-body font-medium">{title}</b>
      <span className="text-xs text-muted">{subtitle}</span>
    </button>
  );
}
export interface OnboardingNavigationProps {
  step: number;
  pending: boolean;
  enabled: boolean;
  onBack: () => void;
  onNext: (skip: boolean) => void;
}
export function OnboardingNavigation({
  step,
  pending,
  enabled,
  onBack,
  onNext,
}: OnboardingNavigationProps) {
  useTranslation();
  return (
    <div className="mt-[6px] flex items-center gap-2">
      {step > 0 && step < 5 && (
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          <Icon name="arrow-left" size={14} />
          {t('Back')}
        </Button>
      )}
      <span className="flex-1" />
      {step === 4 && (
        <Button variant="ghost" onClick={() => onNext(true)} disabled={pending || !enabled}>
          {t('Skip for now')}
        </Button>
      )}
      <Button
        id="onb-next"
        variant="primary"
        size="lg"
        loading={pending}
        disabled={!enabled}
        onClick={() => onNext(false)}
      >
        {step === 4 ? t('Save invites') : t('Continue')}
        <Icon name="arrow-right" size={15} />
      </Button>
    </div>
  );
}
export function SummaryRow({
  icon,
  title,
  subtitle,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      data-summary-row
      className="flex items-center gap-3 border-0 border-t border-solid border-divider px-[14px] py-3"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] text-accent">
        <Icon name={icon} size={14} />
      </span>
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-[12px] text-muted">{subtitle}</div>
      </div>
      <span data-ready-check className="inline-flex text-green">
        <Icon name="check" size={15} />
      </span>
    </div>
  );
}
export interface OnboardingLayoutProps {
  step: number;
  entrance: boolean;
  children: ReactNode;
  onExit: () => void;
}
export function OnboardingLayout({ step, entrance, children, onExit }: OnboardingLayoutProps) {
  useTranslation();
  return (
    <AuthLayout
      topRight={
        <Button variant="ghost" size="sm" onClick={onExit}>
          {t('Exit setup')}
        </Button>
      }
    >
      <section
        data-onboarding-enter={entrance ? '' : undefined}
        data-onboarding-step={step}
        className={`flex w-full flex-col gap-4 ${step === 5 ? 'max-w-[440px]' : 'max-w-[560px]'}`}
      >
        <StepProgress step={step} />
        {children}
      </section>
    </AuthLayout>
  );
}
