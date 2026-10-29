import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import {
  Button,
  Field,
  Icon,
  Input,
  OverlayProvider,
  SegmentedControl,
  ToastViewport,
  useToastQueue,
  useChoiceGroup,
} from '@studio/ui';
import type { IconName } from '@studio/ui';
import { catalogs } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import {
  normalizeOnboardingStep,
  onboardingUnavailable,
  onboardingViews,
} from '../../data/onboarding-demo';
import type { OnboardingDraft } from '../../data/onboarding-demo';
import { AuthMessage } from '../auth/AuthLayout';
import { ChoiceCard, OnboardingLayout, OnboardingNavigation, SummaryRow } from './OnboardingLayout';
import './onboarding.css';

const useCases = [
  ['product', 'target', 'Product', 'Roadmaps & launches'],
  ['design', 'palette', 'Design', 'Reviews & handoff'],
  ['marketing', 'megaphone', 'Marketing', 'Campaigns & content'],
  ['engineering', 'code', 'Engineering', 'Sprints & releases'],
  ['personal', 'user', 'Personal', 'Goals & side projects'],
  ['other', 'sparkles', 'Other', 'Something else'],
] as const;
const workstyles = [
  ['kanban', 'square-kanban', 'Boards', 'Move cards through stages'],
  ['list', 'list-checks', 'Lists', 'Checklists and priorities'],
  ['timeline', 'chart-gantt', 'Timelines', 'Plan with dates & dependencies'],
  ['table', 'table-2', 'Tables', 'Spreadsheet-style tracking'],
] as const;
const sizes = ['Just me', '2-10', '11-50', '51-200', '200+'] as const;
const gridClass = 'grid grid-cols-3 gap-2 max-[640px]:grid-cols-2';
function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  useTranslation();
  return (
    <>
      <h1 className="m-0 text-center text-2xl font-semibold tracking-[-0.022em]">{title}</h1>
      <p hidden>{subtitle}</p>
    </>
  );
}
export function OnboardingPage({ step }: { step: number }) {
  useTranslation();
  return (
    <OverlayProvider>
      <OnboardingController step={step} />
    </OverlayProvider>
  );
}
function OnboardingController({ step: requestedStep }: { step: number }) {
  useTranslation();
  const runtime = useDataRuntime(),
    facade = runtime.onboardingDemo!,
    navigate = useNavigate(),
    router = useRouter(),
    toasts = useToastQueue();
  const [draft, setDraft] = useState(facade.draft),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [workspaceError, setWorkspaceError] = useState(''),
    [optedIn, setOptedIn] = useState(facade.demoEnabled);
  const mockMode = document.getElementById('root')?.dataset.dataMode === 'mock',
    enabled = mockMode || optedIn;
  const step = normalizeOnboardingStep(requestedStep, draft);
  const [animatedStep, setAnimatedStep] = useState<number | null>(step);
  const active = useRef(true),
    sequence = useRef(0),
    busy = useRef(false);
  useEffect(() => {
    document.title = 'DataMaker Task';
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (step !== requestedStep)
      void navigate({ to: '/onboarding', search: { step }, replace: true });
  }, [step, requestedStep, navigate]);
  function update(patch: Partial<OnboardingDraft>) {
    try {
      facade.update(patch);
      setDraft(facade.draft);
      if (['ws', 'url', 'use', 'team', 'size', 'tmpl'].some((key) => key in patch))
        setAnimatedStep(null);
      setError('');
      if (patch.ws?.trim()) setWorkspaceError('');
    } catch {
      setError(t('Your setup could not be saved. Try again.'));
    }
  }
  async function go(next: number) {
    setAnimatedStep(next);
    const token = ++sequence.current;
    await navigate({ to: '/onboarding', search: { step: next } });
    setTimeout(() => {
      if (active.current && token === sequence.current)
        document.querySelector<HTMLInputElement>('[data-onboarding-step] input')?.focus();
    }, 20);
  }
  function next(skip: boolean) {
    if (!enabled || busy.current) return;
    if (step === 1 && !draft.ws.trim()) {
      setAnimatedStep(null);
      setWorkspaceError(t('Name your workspace to continue'));
      document.getElementById('o-ws')?.focus();
      return;
    }
    if (step === 3 && !draft.proj.trim()) {
      toasts.enqueue({ message: t('Give your project a name'), kind: 'error' });
      return;
    }
    if (step === 4 && !skip) {
      const invalid = draft.invites.find((email) => email && !/^\S+@\S+\.\S+$/.test(email));
      if (invalid) {
        toasts.enqueue({
          message: t("{{value1}} isn't a valid email address", { value1: String(invalid) }),
          kind: 'error',
        });
        return;
      }
    }
    try {
      facade.update({
        completedStep: Math.max(draft.completedStep, step),
        ...(skip ? { invites: ['', '', ''] as [string, string, string] } : {}),
      });
      setDraft(facade.draft);
      setWorkspaceError('');
      void go(step + 1);
    } catch {
      setError(t('Your setup could not be saved. Try again.'));
    }
  }
  async function finish() {
    if (busy.current || !enabled) return;
    busy.current = true;
    setPending(true);
    setError('');
    const token = ++sequence.current;
    try {
      const result = await facade.finish(enabled);
      if (!active.current || token !== sequence.current) return;
      await router.options.context.queryClient.cancelQueries();
      if (!active.current || token !== sequence.current) return;
      router.options.context.queryClient.clear();
      if (result.projectId)
        await navigate({
          to: '/w/$workspaceId/projects/$projectId/$view',
          params: {
            workspaceId: result.workspaceId,
            projectId: result.projectId,
            view: onboardingViews[facade.draft.team],
          },
        });
      else
        await navigate({ to: '/w/$workspaceId/home', params: { workspaceId: result.workspaceId } });
    } catch {
      if (active.current && token === sequence.current)
        setError(t('Demo setup could not be opened. Try again. No account or email was created.'));
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/onboarding?step=0`);
      toasts.enqueue({
        message: t('Demo setup link copied. It grants no access and sends no invitation.'),
        kind: 'info',
      });
    } catch {
      toasts.enqueue({ message: t('Unable to copy the demo link'), kind: 'error' });
    }
  }
  const { rootRef: caseChoiceRef, getItemProps: caseItemProps } = useChoiceGroup({
    items: useCases.map(([value]) => ({ value })),
    value: draft.use,
    onValueChange: (use) => update({ use }),
  });
  const { rootRef: workChoicesRef, getItemProps: workChoicesItemProps } = useChoiceGroup({
    items: workstyles.map(([value]) => ({ value })),
    value: draft.team,
    onValueChange: (team) => update({ team }),
  });
  const { rootRef: templateChoicesRef, getItemProps: templateChoicesItemProps } = useChoiceGroup({
    items: catalogs.templates.filter((row) => row.id !== 'blank').map((row) => ({ value: row.id })),
    value: draft.tmpl,
    onValueChange: (tmpl) => update({ tmpl }),
  });
  const template = catalogs.templates.find((row) => row.id === draft.tmpl)!,
    invites = draft.invites.filter((email) => /^\S+@\S+\.\S+$/.test(email)).length;
  return (
    <>
      <OnboardingLayout
        key={step}
        step={step}
        entrance={animatedStep === step}
        onExit={() => {
          sequence.current++;
          void navigate({ to: '/' });
        }}
      >
        {!mockMode && (
          <AuthMessage>
            {optedIn
              ? t(
                  'Demo setup only. Opening the workspace uses the existing workspace. No workspace, account or email is created.',
                )
              : onboardingUnavailable}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                sequence.current++;
                facade.setDemoEnabled(!optedIn);
                setOptedIn(facade.demoEnabled);
              }}
            >
              {optedIn ? t('Close demo') : t('Open demo')}
            </Button>
          </AuthMessage>
        )}
        {error && <AuthMessage error>{error}</AuthMessage>}
        {step === 0 && (
          <>
            <Heading
              title={t('What are you working on?')}
              subtitle={t("We'll tailor templates and views to fit. You can change this later.")}
            />
            <div
              ref={caseChoiceRef}
              role="radiogroup"
              aria-label={t('Use case')}
              className={gridClass}
            >
              {useCases.map(([value, icon, title, subtitle]) => (
                <ChoiceCard
                  key={value}
                  icon={icon}
                  title={t(title)}
                  subtitle={t(subtitle)}
                  selected={draft.use === value}
                  interaction={caseItemProps(value)}
                />
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <Heading
              title={t('Create your workspace')}
              subtitle={t("A workspace is where your team's projects live.")}
            />
            <Field label={t('Workspace name')} controlId="o-ws" error={workspaceError || undefined}>
              {(control) => (
                <>
                  <Input
                    autoFocus
                    size="lg"
                    value={draft.ws}
                    maxLength={120}
                    placeholder={t('e.g. DataMaker Task')}
                    onChange={(event) => update({ ws: event.target.value })}
                    error={!!workspaceError}
                    aria-invalid={!!workspaceError}
                    {...control}
                  />
                </>
              )}
            </Field>
            <Field label={t('Workspace URL')} controlId="o-url">
              {(control) => (
                <>
                  <div className="flex items-center">
                    <span className="flex h-control-lg w-auto items-center rounded-l-sm border border-r-0 border-solid border-border-strong bg-surface-2 px-[10px] text-secondary">
                      {t('hoadev.com/')}
                    </span>
                    <Input
                      size="lg"
                      value={draft.url}
                      maxLength={120}
                      className="rounded-l-none"
                      placeholder="hoadev"
                      onChange={(event) => update({ url: event.target.value })}
                      {...control}
                    />
                  </div>
                  {draft.url && (
                    <span className="flex items-center gap-1 text-xs text-green">
                      <Icon name="check" size={12} />
                      {t('Demo URL: hoadev.com/')}
                      {draft.url}
                    </span>
                  )}
                </>
              )}
            </Field>
          </>
        )}
        {step === 2 && (
          <>
            <Heading
              title={t('How does your team work?')}
              subtitle={t("We'll set your default project view.")}
            />
            <div
              ref={workChoicesRef}
              role="radiogroup"
              aria-label={t('Default project view')}
              className="grid grid-cols-2 gap-2"
            >
              {workstyles.map(([value, icon, title, subtitle]) => (
                <ChoiceCard
                  key={value}
                  icon={icon}
                  title={t(title)}
                  subtitle={t(subtitle)}
                  selected={draft.team === value}
                  interaction={workChoicesItemProps(value)}
                />
              ))}
            </div>
            <div className="flex flex-col gap-[6px]">
              <span className="text-sm font-medium text-foreground">{t('Team size')}</span>
              <SegmentedControl
                label={t('Team size')}
                value={draft.size}
                items={sizes.map((value) => ({ value, label: t(value) }))}
                className="w-fit"
                onValueChange={(value) => update({ size: value as OnboardingDraft['size'] })}
              />
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <Heading
              title={t('Create your first project')}
              subtitle={t('Start from a template or a blank project.')}
            />
            <Field label={t('Project name')} controlId="o-proj">
              {(control) => (
                <>
                  <Input
                    autoFocus
                    size="lg"
                    maxLength={200}
                    value={draft.proj}
                    onChange={(event) => update({ proj: event.target.value })}
                    {...control}
                  />
                </>
              )}
            </Field>
            <div
              ref={templateChoicesRef}
              role="radiogroup"
              aria-label={t('Project template')}
              className={gridClass}
            >
              {catalogs.templates
                .filter((row) => row.id !== 'blank')
                .map((row) => (
                  <ChoiceCard
                    key={row.id}
                    icon={row.icon as IconName}
                    title={t(row.name)}
                    subtitle={t('{{value1}} starter tasks', { value1: String(row.tasks.length) })}
                    selected={draft.tmpl === row.id}
                    interaction={templateChoicesItemProps(row.id)}
                  />
                ))}
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <Heading
              title={t('Invite your team')}
              subtitle={t('Save sample invitations for this demo. No emails are delivered.')}
            />
            <div className="flex flex-col gap-2">
              {draft.invites.map((email, index) => (
                <Input
                  key={index}
                  id={`o-inv-${index}`}
                  size="lg"
                  type="email"
                  maxLength={254}
                  value={email}
                  placeholder="teammate@company.com"
                  aria-label={t('Teammate email {{value1}}', { value1: String(index + 1) })}
                  onChange={(event) => {
                    const invites = [...draft.invites] as OnboardingDraft['invites'];
                    invites[index] = event.target.value.trim();
                    update({ invites });
                  }}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => void copyLink()}
            >
              <Icon name="link" size={13} />
              {t('Copy invite link instead')}
            </Button>
          </>
        )}
        {step === 5 && (
          <>
            <div className="flex justify-center">
              <span
                data-ready-badge
                className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-[color-mix(in_srgb,var(--green)_13%,transparent)] text-green"
              >
                <Icon name="circle-check" size={22} />
              </span>
            </div>
            <Heading
              title={t('Your workspace is ready')}
              subtitle={t(
                'Demo setup preview. No real workspace, account or invitation has been provisioned.',
              )}
            />
            <div className="rounded-lg border border-solid border-border bg-surface">
              <SummaryRow
                icon="building-2"
                title={t('Workspace “{{value1}}”', { value1: String(draft.ws || 'My Workspace') })}
                subtitle={`hoadev.com/${draft.url || 'workspace'}`}
              />
              <SummaryRow
                icon={template.icon as IconName}
                title={t('Project “{{value1}}”', { value1: String(draft.proj) })}
                subtitle={t('{{value1}} starter tasks · {{value2}} view', {
                  value1: String(template.tasks.length),
                  value2: t(
                    onboardingViews[draft.team][0]!.toUpperCase() +
                      onboardingViews[draft.team].slice(1),
                  ),
                })}
              />
              <SummaryRow
                icon="user-plus"
                title={
                  invites
                    ? t('{{value1}} demo invitation{{value2}} saved', {
                        value1: String(invites),
                        value2: String(invites > 1 ? t('s') : ''),
                      })
                    : t('No invites yet')
                }
                subtitle={
                  invites
                    ? t('No emails are delivered')
                    : t('Invite people any time from the sidebar')
                }
              />
            </div>
            <Button
              size="lg"
              variant="primary"
              block
              onClick={() => void finish()}
              loading={pending}
              disabled={!enabled}
            >
              {t('Open workspace')}
              <Icon name="arrow-right" size={15} />
            </Button>
          </>
        )}
        {step < 5 && (
          <OnboardingNavigation
            step={step}
            pending={pending}
            enabled={enabled}
            onBack={() => void go(step - 1)}
            onNext={next}
          />
        )}
      </OnboardingLayout>
      <ToastViewport items={toasts.items} onDismiss={toasts.dismiss} />
    </>
  );
}
