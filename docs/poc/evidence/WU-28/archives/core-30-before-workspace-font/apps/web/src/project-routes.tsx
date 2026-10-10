import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import type { OperationId, OperationInput } from '@studio/contracts/api';
import { sourceId } from '@studio/contracts/source-identities';
import { createMockClient } from './data/adapters/mock';
import { browserMockStorage } from './data/mock/persistence';
import { fixtureClock } from './data/mock/seed';
import { createSharingDemo } from './data/mock/sharing-demo';
import { createStudioClient } from './data/operations';
import { StudioApiError } from './data/errors';
import { StudioDataProvider } from './data/StudioDataProvider';
import { createStudioQueryClient } from './data/queries';
import { createStudioRouter } from './app/router';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyRootPreferences, readThemePreferences } from './theme/preferences';
import './styles/app.css';

// Test-only transport controls around the real router, route hosts and renderers.
applyRootPreferences(readThemePreferences());
const params = new URLSearchParams(location.search), storage = browserMockStorage(), raw = createMockClient({ environment: 'test', ...(storage ? { storage } : {}) });
let failure: OperationId | null = null, heldOperation: OperationId | null = null, heldResponse: OperationId | null = null, release: (() => void) | null = null;
const events: string[] = [];
const client = createStudioClient(async (id, input, options) => {
  events.push(`${id}:begin`);
  if (heldOperation === id) { heldOperation = null; await new Promise<void>(resolve => { release = resolve; }); release = null; }
  if (failure === id) { failure = null; throw new StudioApiError({ error: { code: 'CONFLICT', message: 'Verification request failed' } }); }
  const result = await raw.execute(id, input as OperationInput<typeof id>, options);
  if (heldResponse === id) { heldResponse = null; events.push(`${id}:response-held`); await new Promise<void>(resolve => { release = resolve; }); release = null; }
  events.push(`${id}:confirmed`);
  if (params.has('unavailable') && id === 'getSession') { const session = result as Awaited<ReturnType<typeof raw.api.getSession>>; return { ...session, data: { ...session.data, capabilities: { ...session.data.capabilities, features: { ...session.data.capabilities.features, projectSharing: 'unavailable' } } } }; }
  return result;
});
const cache = createStudioQueryClient(), runtime = { client, clock: fixtureClock, ...(params.has('unavailable') ? {} : { sharingDemo: createSharingDemo(fixtureClock, storage) }) };
declare global { interface Window { __projectsQA: { client: typeof client; raw: typeof raw; cache: typeof cache; events: string[]; fail(id: OperationId): void; hold(id: OperationId): void; holdResponse(id: OperationId): void; held(): boolean; release(): void } } }
window.__projectsQA = { client, raw, cache, events, fail: id => { failure = id; }, hold: id => { heldOperation = id; }, holdResponse: id => { heldResponse = id; }, held: () => !!release, release: () => release?.() };
history.replaceState(history.state, '', params.get('path') ?? `/w/${sourceId('workspaces', 'w1')}/projects`);
const router = createStudioRouter({ runtime, queryClient: cache });
createRoot(document.getElementById('root')!).render(<StrictMode><ThemeProvider><StudioDataProvider runtime={runtime} queryClient={cache}><RouterProvider router={router} /></StudioDataProvider></ThemeProvider></StrictMode>);
