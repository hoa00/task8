import { useEffect, useRef, useState } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { Button, Field, Icon, Input, OverlayProvider, SegmentedControl, useToastQueue } from '@studio/ui';
import type { IconName } from '@studio/ui';
import { catalogs } from '@studio/contracts/api';
import { useDataRuntime } from '../../data/context';
import { normalizeOnboardingStep, onboardingUnavailable, onboardingViews } from '../../data/onboarding-demo';
import type { OnboardingDraft } from '../../data/onboarding-demo';
import { AuthMessage } from '../auth/AuthLayout';
import { ChoiceCard, OnboardingLayout, OnboardingNavigation, SummaryRow } from './OnboardingLayout';

const useCases = [['product', 'target', 'Product', 'Roadmaps & launches'], ['design', 'palette', 'Design', 'Reviews & handoff'], ['marketing', 'megaphone', 'Marketing', 'Campaigns & content'], ['engineering', 'code', 'Engineering', 'Sprints & releases'], ['personal', 'user', 'Personal', 'Goals & side projects'], ['other', 'sparkles', 'Other', 'Something else']] as const;
const workstyles = [['kanban', 'square-kanban', 'Boards', 'Move cards through stages'], ['list', 'list-checks', 'Lists', 'Checklists and priorities'], ['timeline', 'chart-gantt', 'Timelines', 'Plan with dates & dependencies'], ['table', 'table-2', 'Tables', 'Spreadsheet-style tracking']] as const;
const sizes = ['Just me', '2-10', '11-50', '51-200', '200+'] as const;
const gridClass = 'grid grid-cols-3 gap-2 max-[640px]:grid-cols-2';
function Heading({ title, subtitle }: { title: string; subtitle: string }) { return <><h1 className="m-0 text-center text-2xl font-semibold tracking-[-0.022em]">{title}</h1><p hidden>{subtitle}</p></>; }
export function OnboardingPage({ step }: { step: number }) { return <OverlayProvider><OnboardingController step={step} /></OverlayProvider>; }
function OnboardingController({ step: requestedStep }: { step: number }) {
  const runtime = useDataRuntime(), facade = runtime.onboardingDemo!, navigate = useNavigate(), router = useRouter(), toasts = useToastQueue();
  const [draft, setDraft] = useState(facade.draft), [pending, setPending] = useState(false), [error, setError] = useState(''), [workspaceError, setWorkspaceError] = useState(''), [optedIn, setOptedIn] = useState(facade.demoEnabled);
  const mockMode = document.getElementById('root')?.dataset.dataMode === 'mock', enabled = mockMode || optedIn;
  const step = normalizeOnboardingStep(requestedStep, draft), active = useRef(true), sequence = useRef(0), busy = useRef(false);
  useEffect(() => { document.title = 'Gr8r Studio'; active.current = true; return () => { active.current = false; sequence.current++; }; }, []);
  useEffect(() => { if (step !== requestedStep) void navigate({ to: '/onboarding', search: { step }, replace: true }); }, [step, requestedStep, navigate]);
  function update(patch: Partial<OnboardingDraft>) { try { facade.update(patch); setDraft(facade.draft); setError(''); if (patch.ws?.trim()) setWorkspaceError(''); } catch { setError('Your setup could not be saved. Try again.'); } }
  async function go(next: number) { const token = ++sequence.current; await navigate({ to: '/onboarding', search: { step: next } }); setTimeout(() => { if (active.current && token === sequence.current) document.querySelector<HTMLInputElement>('[data-onboarding-step] input')?.focus(); }, 20); }
  function next(skip: boolean) {
    if (!enabled || busy.current) return;
    if (step === 1 && !draft.ws.trim()) { setWorkspaceError('Name your workspace to continue'); document.getElementById('o-ws')?.focus(); return; }
    if (step === 3 && !draft.proj.trim()) { toasts.enqueue({ message: 'Give your project a name', kind: 'error' }); document.getElementById('o-proj')?.focus(); return; }
    if (step === 4 && !skip) { const invalid = draft.invites.find(email => email && !/^\S+@\S+\.\S+$/.test(email)); if (invalid) { toasts.enqueue({ message: `${invalid} isn't a valid email address`, kind: 'error' }); return; } }
    try { facade.update({ completedStep: Math.max(draft.completedStep, step), ...(skip ? { invites: ['', '', ''] as [string, string, string] } : {}) }); setDraft(facade.draft); setWorkspaceError(''); void go(step + 1); } catch { setError('Your setup could not be saved. Try again.'); }
  }
  async function finish() {
    if (busy.current || !enabled) return;
    busy.current = true; setPending(true); setError(''); const token = ++sequence.current;
    try {
      const result = await facade.finish(enabled);
      if (!active.current || token !== sequence.current) return;
      await router.options.context.queryClient.cancelQueries();
      router.options.context.queryClient.clear();
      if (result.projectId) await navigate({ to: '/w/$workspaceId/projects/$projectId/$view', params: { workspaceId: result.workspaceId, projectId: result.projectId, view: onboardingViews[facade.draft.team] } });
      else await navigate({ to: '/w/$workspaceId/home', params: { workspaceId: result.workspaceId } });
    } catch { if (active.current && token === sequence.current) setError('Demo setup could not be opened. Try again. No account or email was created.'); }
    finally { busy.current = false; if (active.current) setPending(false); }
  }
  async function copyLink() { try { await navigator.clipboard.writeText(`${location.origin}/onboarding?step=0`); toasts.enqueue({ message: 'Demo setup link copied. It grants no access and sends no invitation.', kind: 'info' }); } catch { toasts.enqueue({ message: 'Unable to copy the demo link', kind: 'error' }); } }
  const template = catalogs.templates.find(row => row.id === draft.tmpl)!, invites = draft.invites.filter(email => /^\S+@\S+\.\S+$/.test(email)).length;
  return <OnboardingLayout step={step} onExit={() => { sequence.current++; void navigate({ to: '/' }); }}>
    {!mockMode && <AuthMessage>{optedIn ? 'Demo setup only. Opening the workspace uses the existing workspace. No workspace, account or email is created.' : onboardingUnavailable}<Button size="sm" variant="ghost" onClick={() => { facade.demoEnabled = !optedIn; setOptedIn(facade.demoEnabled); }}>{optedIn ? 'Close demo' : 'Open demo'}</Button></AuthMessage>}
    {error && <AuthMessage error>{error}</AuthMessage>}
    {step === 0 && <><Heading title="What are you working on?" subtitle="We'll tailor templates and views to fit. You can change this later." /><div role="radiogroup" aria-label="Use case" className={gridClass}>{useCases.map(([value, icon, title, subtitle]) => <ChoiceCard key={value} icon={icon} title={title} subtitle={subtitle} selected={draft.use === value} onSelect={() => update({ use: value })} />)}</div></>}
    {step === 1 && <><Heading title="Create your workspace" subtitle="A workspace is where your team's projects live." /><Field label="Workspace name" controlId="o-ws" error={workspaceError || undefined}><Input id="o-ws" size="lg" value={draft.ws} maxLength={120} placeholder="e.g. Gr8r Studio" onChange={event => update({ ws: event.target.value })} error={!!workspaceError} aria-invalid={!!workspaceError} /></Field><Field label="Workspace URL" controlId="o-url"><div className="flex items-center"><span className="flex h-control-lg w-auto items-center rounded-l-default border border-r-0 border-solid border-border-strong bg-surface-2 px-[10px] text-secondary">gr8rstudio.com/</span><Input id="o-url" size="lg" value={draft.url} maxLength={120} className="rounded-l-none" placeholder="gr8rstudio" onChange={event => update({ url: event.target.value })} /></div>{draft.url && <span className="flex items-center gap-1 text-xs text-green"><Icon name="check" size={12} />Demo URL: gr8rstudio.com/{draft.url}</span>}</Field></>}
    {step === 2 && <><Heading title="How does your team work?" subtitle="We'll set your default project view." /><div role="radiogroup" aria-label="Default project view" className="grid grid-cols-2 gap-2">{workstyles.map(([value, icon, title, subtitle]) => <ChoiceCard key={value} icon={icon} title={title} subtitle={subtitle} selected={draft.team === value} onSelect={() => update({ team: value })} />)}</div><div className="flex flex-col gap-[6px]"><span className="text-sm font-medium text-secondary">Team size</span><SegmentedControl label="Team size" value={draft.size} items={sizes.map(value => ({ value, label: value }))} className="w-fit" onValueChange={value => update({ size: value as OnboardingDraft['size'] })} /></div></>}
    {step === 3 && <><Heading title="Create your first project" subtitle="Start from a template or a blank project." /><Field label="Project name" controlId="o-proj"><Input id="o-proj" size="lg" maxLength={200} value={draft.proj} onChange={event => update({ proj: event.target.value })} /></Field><div role="radiogroup" aria-label="Project template" className={gridClass}>{catalogs.templates.filter(row => row.id !== 'blank').map(row => <ChoiceCard key={row.id} icon={row.icon as IconName} title={row.name} subtitle={`${row.tasks.length} starter tasks`} selected={draft.tmpl === row.id} onSelect={() => update({ tmpl: row.id })} />)}</div></>}
    {step === 4 && <><Heading title="Invite your team" subtitle="Save sample invitations for this demo. No emails are delivered." /><div className="flex flex-col gap-2">{draft.invites.map((email, index) => <Input key={index} id={`o-inv-${index}`} size="lg" type="email" maxLength={254} value={email} placeholder="teammate@company.com" aria-label={`Teammate email ${index + 1}`} onChange={event => { const invites = [...draft.invites] as OnboardingDraft['invites']; invites[index] = event.target.value.trim(); update({ invites }); }} />)}</div><Button variant="ghost" size="sm" className="self-start" onClick={() => void copyLink()}><Icon name="link" size={13} />Copy invite link instead</Button></>}
    {step === 5 && <><div className="flex justify-center"><span className="flex size-12 items-center justify-center rounded-[12px] bg-[color-mix(in_srgb,var(--green)_13%,transparent)] text-green"><Icon name="circle-check" size={22} /></span></div><Heading title="Your workspace is ready" subtitle="Demo setup preview. No real workspace, account or invitation has been provisioned." /><div className="overflow-hidden rounded-lg border border-solid border-border bg-surface [box-shadow:var(--shadow-sm)]"><SummaryRow icon="building-2" title={`Workspace “${draft.ws || 'My Workspace'}”`} subtitle={`gr8rstudio.com/${draft.url || 'workspace'}`} /><SummaryRow icon={template.icon as IconName} title={`Project “${draft.proj}”`} subtitle={`${template.tasks.length} starter tasks · ${onboardingViews[draft.team][0]!.toUpperCase() + onboardingViews[draft.team].slice(1)} view`} /><SummaryRow icon="user-plus" title={invites ? `${invites} demo invitation${invites > 1 ? 's' : ''} saved` : 'No invites yet'} subtitle={invites ? 'No emails are delivered' : 'Invite people any time from the sidebar'} /></div><Button size="lg" variant="primary" block onClick={() => void finish()} loading={pending} disabled={!enabled}>Open workspace<Icon name="arrow-right" size={15} /></Button></>}
    {step < 5 && <OnboardingNavigation step={step} pending={pending} enabled={enabled} onBack={() => void go(step - 1)} onNext={next} />}
  </OnboardingLayout>;
}
