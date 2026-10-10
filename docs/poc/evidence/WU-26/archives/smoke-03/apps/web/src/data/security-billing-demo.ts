import { z } from 'zod';
import type { Clock } from '@studio/domain';
import { DateOnlySchema, InstantSchema } from '@studio/contracts/api';

export const securityBillingScenarios = ['normal', 'error', 'loading', 'enabled', 'current-session', 'free', 'business'] as const;
export type SecurityBillingScenario = typeof securityBillingScenarios[number];
export type DemoPlan = 'Free' | 'Team' | 'Business';
export interface DemoSession { id: string; device: string; location: string; activity: string; current: boolean }
export interface DemoInvoice { id: string; date: string; amount: string; status: 'Paid' }
export interface SecurityBillingDemoState { version: number; plan: DemoPlan; twoFactorEnabled: boolean; sessionIds: string[] }
export interface SecurityBillingDemoContext { workspaceId: string; principalId: string; demoEnabled: boolean; scenario: SecurityBillingScenario }
export type SecurityBillingDemoCommand = { kind: 'password' } | { kind: 'revokeSession'; sessionId: string } | { kind: 'revokeOthers' } | { kind: 'twoFactor'; enabled: boolean } | { kind: 'plan'; plan: DemoPlan } | { kind: 'payment'; action: 'update' | 'edit' };
export interface SecurityBillingDemoAdapter { read(context: SecurityBillingDemoContext): SecurityBillingDemoState; execute(context: SecurityBillingDemoContext, command: SecurityBillingDemoCommand): Promise<SecurityBillingDemoState>; invoices: readonly DemoInvoice[]; renewalDate: string }
export interface DemoStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const demoSessions: readonly DemoSession[] = [
  { id: 'se1', device: 'MacBook Pro · Chrome', location: 'San Francisco, US', activity: 'Active now', current: true },
  { id: 'se2', device: 'iPhone 15 · Gr8r app', location: 'San Francisco, US', activity: '2 hours ago', current: false },
  { id: 'se3', device: 'Windows · Edge', location: 'Oakland, US', activity: 'Sep 12', current: false },
];
// This fixed demo clock never supplies HTTP identity, authentication or billing time.
export const securityBillingDemoClock: Clock = { now: () => InstantSchema.parse('2026-10-08T09:00:00.000Z'), today: () => DateOnlySchema.parse('2026-10-08') };
export const securityBillingScenarioKey = 'task8.demo.security-billing.scenario.v1';
export function readSecurityBillingScenario(storage?: Pick<DemoStorage, 'getItem'>): SecurityBillingScenario {
  try { const value = storage?.getItem(securityBillingScenarioKey); return securityBillingScenarios.find(scenario => scenario === value) ?? 'normal'; } catch { return 'normal'; }
}
export interface DemoPasswordErrors { current?: string; next?: string; confirmation?: string }
export function validateDemoPassword(current: string, next: string, confirmation: string): DemoPasswordErrors {
  return { ...(!current ? { current: 'Enter your current password' } : {}), ...(next.length < 10 || !/[0-9\W]/.test(next) ? { next: 'Use at least 10 characters, including a number or symbol' } : {}), ...(next !== confirmation ? { confirmation: "Passwords don't match" } : {}) };
}
export function validateDemoCode(code: string): boolean { return /^\d{6}$/.test(code.trim()); }
const stateSchema = z.object({ version: z.number().int().positive(), plan: z.enum(['Free', 'Team', 'Business']), twoFactorEnabled: z.boolean(), sessionIds: z.array(z.enum(['se1', 'se2', 'se3'])).refine(ids => new Set(ids).size === ids.length && ids.includes('se1')) }).strict();
export function createSecurityBillingDemo(clock: Clock = securityBillingDemoClock, storage?: DemoStorage, wait: (milliseconds: number) => Promise<void> = milliseconds => milliseconds ? new Promise(resolve => setTimeout(resolve, milliseconds)) : Promise.resolve()): SecurityBillingDemoAdapter {
  const memory = new Map<string, SecurityBillingDemoState>();
  const keyFor = (context: SecurityBillingDemoContext) => `task8.demo.security-billing.v1:${context.workspaceId}:${context.principalId}:${context.scenario}`;
  const initial = (scenario: SecurityBillingScenario): SecurityBillingDemoState => ({ version: 1, plan: scenario === 'free' ? 'Free' : scenario === 'business' ? 'Business' : 'Team', twoFactorEnabled: scenario === 'enabled', sessionIds: scenario === 'current-session' ? ['se1'] : ['se1', 'se2', 'se3'] });
  function read(context: SecurityBillingDemoContext): SecurityBillingDemoState {
    if (!context.demoEnabled) return initial('normal');
    const key = keyFor(context); if (memory.has(key)) return structuredClone(memory.get(key)!);
    let state = initial(context.scenario);
    try { const raw = storage?.getItem(key); if (raw) state = stateSchema.parse(JSON.parse(raw)); } catch { /* Corrupt demo records cannot alter canonical data. */ }
    memory.set(key, state); return structuredClone(state);
  }
  const date = (offset: number) => new Date(Date.parse(`${clock.today()}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  return { read, renewalDate: date(7), invoices: [-23, -53, -84, -114].map((offset, index) => ({ id: `INV-2026-00${9 - index}`, date: date(offset), amount: index < 2 ? '$96.00' : '$80.00', status: 'Paid' })), async execute(context, command) {
    if (!context.demoEnabled) throw Error('Security and billing services are unavailable in this environment.');
    await wait(command.kind === 'password' ? 800 : context.scenario === 'loading' ? 1200 : 0);
    if (context.scenario === 'error') throw Error('Demo operation failed. Your account access and payments are unchanged.');
    const next = read(context);
    if (command.kind === 'password' || command.kind === 'payment') return next;
    if (command.kind === 'revokeSession') { if (command.sessionId === 'se1' || !next.sessionIds.includes(command.sessionId)) throw Error('This demo session cannot be signed out.'); next.sessionIds = next.sessionIds.filter(id => id !== command.sessionId); }
    if (command.kind === 'revokeOthers') next.sessionIds = ['se1'];
    if (command.kind === 'twoFactor') next.twoFactorEnabled = command.enabled;
    if (command.kind === 'plan') next.plan = z.enum(['Free', 'Team', 'Business']).parse(command.plan);
    next.version++;
    const parsed = stateSchema.parse(next);
    // Only sample IDs, a plan label and a boolean are persisted. Never passwords,
    // authenticator codes/secrets, payment details or a canonical session principal.
    storage?.setItem(keyFor(context), JSON.stringify(parsed));
    memory.set(keyFor(context), parsed); return structuredClone(parsed);
  } };
}
