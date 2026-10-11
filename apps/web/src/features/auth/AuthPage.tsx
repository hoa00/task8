import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { Button, Checkbox, Field, Icon, Input, PasswordInput, PasswordStrength, ToastViewport, useToastQueue, OverlayProvider } from '@studio/ui';
import { useDataRuntime } from '../../data/context';
import { authLoginError, authUnavailableMessage, validateAuth } from '../../data/auth-demo';
import type { AuthDemoCommand, AuthErrors, AuthScreen } from '../../data/auth-demo';
import { AuthDivider, AuthHeading, AuthLayout, AuthMessage, SocialAuthButtons, authFootClass, authLinkClass } from './AuthLayout';
import './auth.css';

interface AuthLinkProps { children: ReactNode; next: AuthScreen; onNavigate: (screen: AuthScreen) => Promise<void>; className?: string }
function AuthLink({ children, next, onNavigate, className = '' }: AuthLinkProps) { useTranslation(); return <button type="button" className={`${authLinkClass} ${className}`} onClick={() => void onNavigate(next)}>{children}</button>; }
interface AuthActionProps { children: ReactNode; kind: string; enabled: boolean; pending: string | undefined; next?: AuthScreen; onNavigate: (screen: AuthScreen) => Promise<void> }
function AuthAction({ children, kind, enabled, pending, next, onNavigate }: AuthActionProps) { useTranslation(); return <Button size="lg" variant="primary" block type={next ? 'button' : 'submit'} id={`${kind}-btn`} disabled={!enabled} loading={pending === kind} onClick={next ? () => void onNavigate(next) : undefined}>{children}</Button>; }

export interface AuthPageProps { screen: AuthScreen }
export function AuthPage({ screen }: AuthPageProps) { useTranslation();
  const runtime = useDataRuntime(), navigate = useNavigate(), facade = runtime.authDemo;
  const [demoOptIn, setDemoOptIn] = useState(facade?.demoEnabled ?? false);
  const mockMode = document.getElementById('root')?.dataset.dataMode === 'mock';
  const title = 'Gr8r Studio';
  useEffect(() => { document.title = title; }, [title]);
  return <OverlayProvider><AuthController key={`${screen}:${demoOptIn}`} screen={screen} enabled={mockMode || demoOptIn} onDemo={() => { if (!facade) return; if (demoOptIn) facade.reset(); else facade.setDemoEnabled(true); setDemoOptIn(facade.demoEnabled); }} optedIn={demoOptIn} facade={facade} onEnter={async () => {
    await navigate({ to: '/' });
  }} />{createPortal(<div data-auth-live aria-live="polite" className="absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]" />, document.body)}</OverlayProvider>;
}
interface AuthControllerProps extends AuthPageProps { enabled: boolean; optedIn: boolean; onDemo: () => void; facade: ReturnType<typeof useDataRuntime>['authDemo']; onEnter: () => Promise<void> }
function AuthController({ screen, enabled, optedIn, onDemo, facade, onEnter }: AuthControllerProps) { useTranslation();
  const navigate = useNavigate(), root = useRef<HTMLFormElement & HTMLDivElement>(null), mounted = useRef(false), sequence = useRef(0);
  const [email, setEmail] = useState(screen === 'signup' ? '' : facade?.draft.email ?? 'hello@gr8rstudio.com');
  const [name, setName] = useState(facade?.draft.name ?? ''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [revealed, setRevealed] = useState(false), [remember, setRemember] = useState(true), [errors, setErrors] = useState<AuthErrors>({});
  const [pending, setPending] = useState<string>(), toasts = useToastQueue();
  const [entrance, setEntrance] = useState(true);
  const [presentationRevision, setPresentationRevision] = useState(0);
  const preservedFocus = useRef<{ id: string; start: number | null; end: number | null }>(null);
  function refreshPresentation(controlId?: string) {
    const active = document.activeElement;
    preservedFocus.current = { id: controlId ?? active?.id ?? '', start: active instanceof HTMLInputElement ? active.selectionStart : null, end: active instanceof HTMLInputElement ? active.selectionEnd : null };
    setEntrance(false); setPresentationRevision(revision => revision + 1);
  }
  useLayoutEffect(() => {
    if (!presentationRevision) return;
    const saved = preservedFocus.current;
    const control = saved?.id ? root.current?.querySelector<HTMLElement>(`#${CSS.escape(saved.id)}`) : undefined;
    control?.focus({ preventScroll: true });
    if (control instanceof HTMLInputElement && saved?.start != null && saved.end != null && ['text', 'password'].includes(control.type)) control.setSelectionRange(saved.start, saved.end);
  }, [presentationRevision]);
  const [cooldown, setCooldown] = useState(() => Math.max(0, Math.ceil(((facade?.resendUntil ?? 0) - performance.now()) / 1000)));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (screen !== 'verify' || !facade) return;
    const timer = setInterval(() => setCooldown(Math.max(0, Math.ceil((facade.resendUntil - performance.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [screen, facade]);
  async function go(next: AuthScreen) {
    const intent = ++sequence.current; setPending(undefined);
    if (next === 'forgot-sent') await navigate({ to: '/forgot-password', search: { state: 'sent' } });
    else if (next === 'reset-done') await navigate({ to: '/reset-password', search: { state: 'done' } });
    else await navigate({ to: ({ login: '/login', signup: '/signup', forgot: '/forgot-password', reset: '/reset-password', verify: '/verify-email' } as const)[next] });
    setTimeout(() => { if (sequence.current === intent) document.querySelector<HTMLInputElement>(`[data-auth-card="${next}"] input`)?.focus(); }, 20);
  }
  async function execute(command: AuthDemoCommand, label: string) {
    if (pending || !enabled || !facade) return;
    const current = ++sequence.current, generation = facade.generation; setPending(label); toasts.clear();
    try {
      await facade.execute(command, enabled);
      if (!mounted.current || current !== sequence.current || generation !== facade.generation) return;
      if (command.kind === 'login' || command.kind === 'social') await onEnter();
      else if (command.kind === 'signup') { facade.startResend(performance.now()); await go('verify'); }
      else if (command.kind === 'forgot') await go('forgot-sent');
      else if (command.kind === 'reset') { setPassword(''); setConfirmation(''); await go('reset-done'); }
      else if (command.kind === 'verify') await navigate({ to: '/onboarding', search: { step: 0 } });
      else if (command.kind === 'resend') {
        if (screen === 'verify') { facade.startResend(performance.now()); setCooldown(30); refreshPresentation(); }
        toasts.enqueue({ message: screen === 'verify' ? t("Demo verification link requested. No email is delivered.") : t("Demo reset link requested. No email is delivered."), kind: 'info' });
      }
    } catch (error) { if (mounted.current && current === sequence.current && generation === facade.generation) { refreshPresentation(); setErrors({ login: error instanceof Error && error.message === authLoginError ? authLoginError : 'Demo operation failed. No identity or email delivery was created.' }); } }
    finally { if (mounted.current && current === sequence.current) setPending(undefined); }
  }
  function submit() {
    if (pending || !enabled) return;
    const draft = { email: email.trim(), name: name.trim() }, nextErrors = validateAuth(screen, draft, password, confirmation);
    facade?.setDraft(draft);
    setEmail(draft.email); setName(draft.name); setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      refreshPresentation();
      if (screen === 'login') {
        setRemember(true);
        if (nextErrors.email) setPassword('');
        setTimeout(() => root.current?.querySelector<HTMLInputElement>(nextErrors.email ? '#l-email' : '#l-pw')?.focus(), 0);
      } else if (screen === 'reset') setConfirmation('');
      return;
    }
    if (screen === 'login' || screen === 'signup' || screen === 'forgot' || screen === 'reset') void execute({ kind: screen }, screen);
  }
  const footer = (children: ReactNode) => <p className={authFootClass}>{children}</p>;
  const social = <SocialAuthButtons disabled={!enabled} pending={pending} onSocial={provider => void execute({ kind: 'social', provider }, provider)} />;
  const emailField = (id: string, label = 'Email', placeholder?: string) => <Field label={label} controlId={id} error={errors.email}><Input id={id} type="email" size="lg" autoComplete="email" value={email} placeholder={placeholder} error={!!errors.email} disabled={!enabled} onChange={event => setEmail(event.target.value)} /></Field>;
  const passwordField = (id: string, label: string, strength = false) => <Field label={label} controlId={id} error={errors.pw} hint={screen === 'signup' ? t("At least 10 characters with a number or symbol.") : undefined}><PasswordInput id={id} size="lg" revealControl={false} autoComplete="new-password" value={password} error={!!errors.pw} disabled={!enabled} onChange={event => setPassword(event.target.value)} />{strength && <PasswordStrength value={password} />}</Field>;
  let content: ReactNode;
  if (screen === 'login') content = <><AuthHeading title={t("Welcome back")} subtitle={t("Sign in to Gr8r Studio")} />{errors.login && <AuthMessage error>{errors.login}</AuthMessage>}{emailField('l-email')}<div className="flex flex-col gap-[6px]"><div className="flex items-center gap-2"><label htmlFor="l-pw" className="text-sm font-medium">{t("Password")}</label><span className="flex-1" /><AuthLink next="forgot" onNavigate={go} className="text-[12.5px]">{t("Forgot password?")}</AuthLink></div><PasswordInput id="l-pw" size="lg" autoComplete="current-password" value={password} revealed={revealed} onRevealedChange={value => { refreshPresentation('l-pw'); setRemember(true); setEmail(facade?.draft.email ?? 'hello@gr8rstudio.com'); setRevealed(value); root.current?.querySelector<HTMLInputElement>('#l-pw')?.focus(); }} error={!!errors.pw} disabled={!enabled} onChange={event => setPassword(event.target.value)} />{errors.pw && <span className="flex items-center gap-1 text-xs text-red"><Icon name="circle-alert" size={12} />{errors.pw}</span>}</div><label className="flex cursor-pointer items-center gap-2 text-[13px]"><Checkbox id="l-rem" checked={remember} onCheckedChange={setRemember} />{t("Remember me for 30 days")}</label><AuthAction kind="login" enabled={enabled} pending={pending} onNavigate={go}>{t("Sign in")}</AuthAction><AuthDivider />{social}{footer(<>{t("Don't have an account?")} <AuthLink next="signup" onNavigate={go}>{t("Sign up")}</AuthLink></>)}</>;
  else if (screen === 'signup') content = <><AuthHeading title={t("Create your account")} subtitle={t("Free for up to 3 members. No credit card required.")} />{social}<AuthDivider>{t("or sign up with email")}</AuthDivider><Field label={t("Full name")} controlId="s-name" error={errors.name}><Input id="s-name" size="lg" autoComplete="name" placeholder={t("Tanjim Islam")} value={name} error={!!errors.name} disabled={!enabled} onChange={event => setName(event.target.value)} /></Field>{emailField('s-email', 'Work email', 'you@company.com')}{passwordField('s-pw', 'Password', true)}<AuthAction kind="signup" enabled={enabled} pending={pending} onNavigate={go}>{t("Create account")}</AuthAction><p className="text-center text-xs text-muted">{t("By creating an account you agree to the Terms and Privacy Policy.")}</p>{footer(<>{t("Already have an account?")} <AuthLink next="login" onNavigate={go}>{t("Sign in")}</AuthLink></>)}</>;
  else if (screen === 'forgot') content = <><AuthHeading title={t("Reset your password")} subtitle={t("Enter your account email and we'll send you a reset link.")} icon="key-round" />{emailField('f-email')}<AuthAction kind="forgot" enabled={enabled} pending={pending} onNavigate={go}>{t("Send reset link")}</AuthAction>{footer(<AuthLink next="login" onNavigate={go} className="inline-flex items-center gap-[6px]"><><Icon name="arrow-left" size={14} />{t("Back to sign in")}</></AuthLink>)}</>;
  else if (screen === 'forgot-sent') content = <><AuthHeading title={t("Check your email")} subtitle={<>{t("We sent a reset link to")} <b>{email}</b>{t(". It expires in 30 minutes.")}</>} icon="mail-check" success /><AuthAction kind="reset" enabled={enabled} pending={pending} onNavigate={go} next="reset">{t("Open reset link")}</AuthAction><AuthMessage>{t("In this prototype, the button above stands in for the link in your email.")}</AuthMessage>{footer(<>{t("Didn't get it?")} <button type="button" className={authLinkClass} disabled={!enabled} onClick={() => void execute({ kind: 'resend' }, 'resend')}>{t("Resend email")}</button></>)}{footer(<AuthLink next="login" onNavigate={go} className="inline-flex items-center gap-[6px]"><><Icon name="arrow-left" size={14} />{t("Back to sign in")}</></AuthLink>)}</>;
  else if (screen === 'reset') content = <><AuthHeading title={t("Choose a new password")} subtitle={<>{t("for")} {email}</>} />{passwordField('r-pw', 'New password', true)}<Field label={t("Confirm password")} controlId="r-pw2" error={errors.pw2}><PasswordInput id="r-pw2" size="lg" revealControl={false} autoComplete="new-password" value={confirmation} error={!!errors.pw2} disabled={!enabled} onChange={event => setConfirmation(event.target.value)} /></Field><AuthAction kind="reset" enabled={enabled} pending={pending} onNavigate={go}>{t("Reset password")}</AuthAction></>;
  else if (screen === 'reset-done') content = <><AuthHeading title={t("Password updated")} subtitle={t("You can now sign in with your new password.")} icon="circle-check" success /><AuthAction kind="login" enabled={enabled} pending={pending} onNavigate={go} next="login">{t("Sign in")}</AuthAction></>;
  else content = <><AuthHeading title={t("Verify your email")} subtitle={<>{t("We sent a verification link to")} <b>{email}</b>{t(". Click it to activate your account.")}</>} icon="mail" /><div className="flex items-center gap-[10px] rounded-lg border border-solid border-border bg-surface px-[14px] py-3"><span className="ui-skeleton size-2 rounded-full [animation-duration:1.1s]" /><span className="text-[13px] text-secondary">{t("Waiting for verification…")}</span></div><Button size="lg" variant="primary" block disabled={!enabled} loading={pending === 'verify'} onClick={() => void execute({ kind: 'verify' }, 'verify')}>{t("I've verified my email")}</Button><Button id="resend-btn" size="lg" block disabled={!enabled || cooldown > 0} onClick={() => void execute({ kind: 'resend' }, 'resend')}>{cooldown > 0 ? <>{t("Resend email in")} <span className="tabular-nums" id="resend-t">{cooldown}</span>{t("s")}</> : t("Resend email")}</Button>{footer(<>{t("Wrong email?")} <AuthLink next="signup" onNavigate={go}>{t("Change it")}</AuthLink></>)}</>;
  const form = ['login', 'signup', 'forgot', 'reset'].includes(screen);
  const children = <>{!enabled && <><AuthMessage>{authUnavailableMessage}</AuthMessage><Button onClick={onDemo}>{t("Open demo")}</Button></>}{optedIn && <div className="flex items-center justify-between text-xs text-muted"><span>{t("Demo only · No identity or email delivery")}</span><Button size="sm" variant="ghost" onClick={onDemo}>{t("Close demo")}</Button></div>}{content}{errors.login && screen !== 'login' && <AuthMessage error>{errors.login}</AuthMessage>}</>;
  const props = { 'data-auth-card': screen, 'data-auth-enter': entrance ? '' : undefined, className: 'flex w-full max-w-[380px] flex-col gap-4', ref: root };
  return <><AuthLayout key={presentationRevision} topRight={screen === 'login' ? <Button variant="ghost" size="sm" onClick={() => void go('signup')}>{t("Sign up")}</Button> : screen === 'signup' ? <Button variant="ghost" size="sm" onClick={() => void go('login')}>{t("Log in")}</Button> : undefined}>{form ? <form {...props} noValidate onSubmit={event => { event.preventDefault(); submit(); }}>{children}</form> : <div {...props}>{children}</div>}</AuthLayout><ToastViewport items={toasts.items} onDismiss={toasts.dismiss} /></>;
}
