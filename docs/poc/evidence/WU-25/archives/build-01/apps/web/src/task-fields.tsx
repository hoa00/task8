import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OverlayProvider } from '@studio/ui';
import type { OperationInput } from '@studio/contracts/api';
import { TaskFieldsGalleryEntry } from './features/tasks/TaskFieldsGalleryEntry';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyRootPreferences, readThemePreferences } from './theme/preferences';
import { StudioDataProvider } from './data/StudioDataProvider';
import { createStudioQueryClient } from './data/queries';
import { createMockClient } from './data/adapters/mock';
import { createStudioClient } from './data/operations';
import { fixtureClock } from './data/mock/seed';
import { StudioApiError } from './data/errors';
import './styles/app.css';
applyRootPreferences(readThemePreferences());
const raw = createMockClient({ environment: 'test' }); let failNext = false;
let holdNext = false; let failReads = false; let held: { resolve: (value: boolean) => void } | null = null;
const client = createStudioClient(async (id, input, options) => { if (holdNext && ['updateTask', 'moveTask'].includes(id)) { holdNext = false; const reject = await new Promise<boolean>(resolve => { held = { resolve }; }); if (reject) throw new StudioApiError({ error: { code: 'CONFLICT', message: 'Held mutation conflicted' } }); } if (failReads && id === 'getTask') throw new StudioApiError({ error: { code: 'INTERNAL_ERROR', message: 'Read failed in race probe' } }); if (failNext && ['updateTask', 'moveTask', 'setTaskCompletion'].includes(id)) { failNext = false; throw new StudioApiError({ error: { code: 'CONFLICT', message: 'The task changed. Review the current values and try again.' } }); } return raw.execute(id, input as OperationInput<typeof id>, options); });
const runtime = { client, clock: fixtureClock }, queryClient = createStudioQueryClient();
declare global { interface Window { __taskFieldsQA: { holdNextMutation(): void; releaseHeld(reject: boolean): void; failReads(value: boolean): void; isHeld(): boolean; client: typeof client; queryClient: typeof queryClient } } }
window.__taskFieldsQA = { holdNextMutation: () => { holdNext = true; }, releaseHeld: reject => { held?.resolve(reject); held = null; }, failReads: value => { failReads = value; }, isHeld: () => !!held, client, queryClient };

const root = document.getElementById('root'); if (!root) throw new Error('Missing task fields root');
createRoot(root).render(<StrictMode><ThemeProvider><StudioDataProvider runtime={runtime} queryClient={queryClient}><OverlayProvider><TaskFieldsGalleryEntry onFailNext={() => { failNext = true; }} /></OverlayProvider></StudioDataProvider></ThemeProvider></StrictMode>);
