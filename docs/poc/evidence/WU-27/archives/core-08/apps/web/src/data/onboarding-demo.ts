import { z } from 'zod';
import { catalogs, EntityIdSchema, TemplateIdSchema } from '@studio/contracts/api';
import type { MockStorage } from './mock/persistence.ts';

export const onboardingStorageKey = 'task8.demo.onboarding.v1';
export function onboardingFlowId(): string { const time = Date.now().toString(16).padStart(12, '0'), random = crypto.randomUUID(); return EntityIdSchema.parse(`${time.slice(0, 8)}-${time.slice(8)}-7${random.slice(15, 18)}-${random.slice(19)}`); }
export const OnboardingDraftSchema = z.strictObject({
  flowId: EntityIdSchema, completedStep: z.number().int().min(-1).max(4),
  use: z.enum(['product', 'design', 'marketing', 'engineering', 'personal', 'other']),
  team: z.enum(['kanban', 'list', 'timeline', 'table']), size: z.enum(['Just me', '2-10', '11-50', '51-200', '200+']),
  ws: z.string().max(120), url: z.string().max(120), urlTouched: z.boolean(),
  proj: z.string().max(200), projTouched: z.boolean(), tmpl: TemplateIdSchema,
  invites: z.tuple([z.string().max(254), z.string().max(254), z.string().max(254)]),
});
export type OnboardingDraft = z.infer<typeof OnboardingDraftSchema>;
export const onboardingViews = { kanban: 'board', list: 'list', timeline: 'timeline', table: 'table' } as const;
export const onboardingUnavailable = 'Workspace setup services are unavailable. Open the demo to explore setup; no workspace, account or email will be created.';
const ResultSchema = z.strictObject({ workspaceId: EntityIdSchema, projectId: EntityIdSchema.nullable(), mode: z.enum(['scoped-demo', 'seed-demo']) });
export type OnboardingResult = z.infer<typeof ResultSchema>;
const RecordSchema = z.strictObject({ draft: OnboardingDraftSchema, result: ResultSchema.nullable() }).refine(record => !record.result || record.result.mode !== 'scoped-demo' || record.result.workspaceId === record.draft.flowId, 'Receipt belongs to another demo flow');
export function defaultOnboardingDraft(flowId: string): OnboardingDraft { return { flowId: EntityIdSchema.parse(flowId), completedStep: -1, use: 'product', team: 'kanban', size: '2-10', ws: '', url: '', urlTouched: false, proj: 'Website Launch', projTouched: false, tmpl: 'web', invites: ['', '', ''] }; }
export function normalizeOnboardingStep(requested: number, draft: OnboardingDraft): number {
  const step = Number.isInteger(requested) && requested >= 0 && requested <= 5 ? requested : 0;
  if (step > 0 && draft.completedStep < 0) return 0;
  if (step > 1 && (!draft.ws.trim() || draft.completedStep < 1)) return 1;
  if (step > 2 && draft.completedStep < 2) return 2;
  if (step > 3 && (!draft.proj.trim() || draft.completedStep < 3)) return 3;
  if (step > 4 && draft.completedStep < 4) return 4;
  return step;
}
export function updateOnboardingDraft(draft: OnboardingDraft, patch: Partial<OnboardingDraft>): OnboardingDraft {
  const next = { ...draft, ...patch };
  if (patch.ws !== undefined && !draft.urlTouched) next.url = patch.ws.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (patch.url !== undefined) { next.url = patch.url.toLowerCase().replace(/[^a-z0-9-]+/g, '-'); next.urlTouched = true; }
  if (patch.proj !== undefined) next.projTouched = true;
  if (patch.tmpl !== undefined && !draft.projTouched) { const template = catalogs.templates.find(template => template.id === patch.tmpl)!; next.proj = template.name === 'Website' ? 'Website Launch' : template.name; }
  return OnboardingDraftSchema.parse(next);
}
export interface OnboardingDemoAdapter {
  draft: OnboardingDraft; result: OnboardingResult | null; demoEnabled: boolean;
  setDemoEnabled(enabled: boolean): void;
  update(patch: Partial<OnboardingDraft>): void;
  finish(enabled: boolean): Promise<OnboardingResult>;
}
export function createOnboardingDemo(flowId: string, complete: (draft: OnboardingDraft) => Promise<OnboardingResult>, storage?: MockStorage, storageKey = onboardingStorageKey): OnboardingDemoAdapter {
  let saved: z.infer<typeof RecordSchema> | undefined;
  try { const raw = storage?.getItem(storageKey); if (raw) saved = RecordSchema.parse(JSON.parse(raw)); } catch { /* Invalid drafts restart at step zero. */ }
  let pending: Promise<OnboardingResult> | undefined;
  const persist = (draft: OnboardingDraft, result: OnboardingResult | null) => {
    if (storage) storage.setItem(storageKey, JSON.stringify(RecordSchema.parse({ draft, result })));
  };
  return { draft: saved?.draft ?? defaultOnboardingDraft(flowId), result: saved?.result ?? null, demoEnabled: false,
    setDemoEnabled(enabled) { this.demoEnabled = enabled; },
    update(patch) { if (this.result || pending) return; const next = updateOnboardingDraft(this.draft, patch); persist(next, null); this.draft = next; },
    finish(enabled) {
      if (!enabled) return Promise.reject(Error(onboardingUnavailable));
      // A receipt is a UI draft lock, not authority to select a workspace. The
      // adapter revalidates its durable scope or HTTP's current configured seed.
      if (pending) return pending;
      if (normalizeOnboardingStep(5, this.draft) !== 5) return Promise.reject(Error('Complete setup before opening the workspace'));
      const snapshot = structuredClone(this.draft);
      pending = complete(snapshot).then(value => { const result = ResultSchema.parse(value); persist(snapshot, result); this.result = result; return result; }).finally(() => { pending = undefined; });
      return pending;
    },
  };
}
