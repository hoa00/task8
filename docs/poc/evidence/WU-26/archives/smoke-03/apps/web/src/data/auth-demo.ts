export type AuthScreen = 'login' | 'signup' | 'forgot' | 'forgot-sent' | 'reset' | 'reset-done' | 'verify';
export type AuthDemoCommand = { kind: 'login' | 'signup' | 'forgot' | 'reset' | 'verify' | 'resend' } | { kind: 'social'; provider: 'Google' | 'Microsoft' | 'Apple' };
export interface AuthDraft { email: string; name: string }
export const authScenarioKey = 'task8.demo.auth.scenario.v1';
export const authLoginError = 'Invalid email or password. Please try again.';
export interface AuthDemoAdapter { draft: AuthDraft; resendUntil: number; demoEnabled: boolean; generation: number; scenario: 'normal' | 'login-error'; reset(): void; execute(command: AuthDemoCommand, enabled: boolean): Promise<void> }
export const authUnavailableMessage = 'Authentication services are unavailable in this environment. Open the demo to explore these screens.';
// No storage, password, identity, API client or email provider enters this facade.
// Drafts last only for this browser runtime; reload creates the Source defaults.
export function createAuthDemo(wait: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), scenario: 'normal' | 'login-error' = 'normal'): AuthDemoAdapter {
  return { draft: { email: 'hello@gr8rstudio.com', name: '' }, resendUntil: 0, demoEnabled: false, generation: 0, scenario, reset() { this.draft = { email: 'hello@gr8rstudio.com', name: '' }; this.resendUntil = 0; this.demoEnabled = false; this.generation++; }, async execute(command, enabled) {
    if (!enabled) throw Error(authUnavailableMessage);
    const durations = { login: 750, signup: 800, social: 800, forgot: 700, reset: 700, verify: 0, resend: 0 };
    await wait(durations[command.kind]);
    if (command.kind === 'login' && this.scenario === 'login-error') throw Error(authLoginError);
  } };
}
export function readAuthScenario(storage?: Pick<Storage, 'getItem'>): 'normal' | 'login-error' {
  try { return storage?.getItem(authScenarioKey) === 'login-error' ? 'login-error' : 'normal'; } catch { return 'normal'; }
}
export interface AuthErrors { email?: string; pw?: string; name?: string; pw2?: string; login?: string }
export function validateAuth(screen: AuthScreen, draft: AuthDraft, password: string, confirmation: string): AuthErrors {
  const email = draft.email.trim(), errors: AuthErrors = {}, validEmail = /^\S+@\S+\.\S+$/.test(email);
  if (screen === 'login') {
    if (!email) errors.email = 'Enter your email address';
    else if (!validEmail) errors.email = 'Enter a valid email, like name@company.com';
    if (!password) errors.pw = 'Enter your password';
  }
  if (screen === 'signup') {
    if (!draft.name.trim()) errors.name = 'Enter your name';
    if (!validEmail) errors.email = 'Enter a valid work email';
  }
  if (screen === 'forgot' && !validEmail) errors.email = 'Enter the email you use to sign in';
  if ((screen === 'signup' || screen === 'reset') && (password.length < 10 || !/[0-9\W]/.test(password))) errors.pw = 'Use at least 10 characters, including a number or symbol';
  if (screen === 'reset' && password !== confirmation) errors.pw2 = "Passwords don't match";
  return errors;
}
