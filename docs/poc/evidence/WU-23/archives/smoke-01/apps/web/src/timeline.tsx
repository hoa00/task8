import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OverlayProvider } from '@studio/ui';
import { DateOnlySchema } from '@studio/contracts/api';
import type { OperationId, OperationInput } from '@studio/contracts/api';
import type { TimelineGrouping, TimelineZoom, WeekStart } from '@studio/domain';
import { StudioDataProvider } from './data/StudioDataProvider';
import { createStudioQueryClient, useStudioQuery } from './data/queries';
import { createMockClient } from './data/adapters/mock';
import { createStudioClient } from './data/operations';
import { StudioApiError } from './data/errors';
import { browserMockStorage, persistMockDataset } from './data/mock/persistence';
import { createSeedDataset, fixtureClock } from './data/mock/seed';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyRootPreferences, readThemePreferences } from './theme/preferences';
import { TimelinePage } from './features/timeline/TimelinePages';
import { calendarDateParam } from './features/calendar/date-format';
import { TaskOverlayHost } from './features/tasks/detail/TaskOverlayHost';
import type { TaskFormIntent, TaskMenuIntent } from './features/tasks/detail/TaskOverlayHost';
import './styles/app.css';
applyRootPreferences(readThemePreferences());
const params = new URLSearchParams(location.search), storage = browserMockStorage(), fixture = params.get('fixture');
// Explicit symmetric visual fixtures live only in this feature harness. No
// source template/style changes or production capability is introduced.
if (fixture && storage) {
  const seed = createSeedDataset();
  if (['empty', 'undated'].includes(fixture)) { for (const project of Object.values(seed.projects)) project.milestones = []; for (const task of Object.values(seed.tasks)) { task.dueDate = null; task.startDate = null; } }
  if (fixture === 'milestones-only') for (const task of Object.values(seed.tasks)) { task.dueDate = null; task.startDate = null; }
  if (fixture === 'collision') for (const project of Object.values(seed.projects)) for (const [index, milestone] of project.milestones.entries()) { milestone.date = index < 2 ? fixtureClock.today() : DateOnlySchema.parse('2026-10-09'); milestone.name = index === 0 ? 'A very long release milestone name that must truncate before the next diamond' : milestone.name; }
  if (fixture === 'outside-range') { const task = Object.values(seed.tasks)[0]!; task.startDate = DateOnlySchema.parse('2027-10-01'); task.dueDate = DateOnlySchema.parse('2027-10-03'); }
  persistMockDataset(storage, seed);
}
const raw = createMockClient({ ...(storage ? { storage } : {}), environment: 'test' });
let fail: 'CONFLICT' | 'INTERNAL_ERROR' | null = null, held = false, release: (() => void) | null = null;
const calls: { id: OperationId; input: unknown }[] = [];
const client = createStudioClient(async (id, input, options) => {
  calls.push({ id, input });
  if (id === 'updateTask' && held) { held = false; await new Promise<void>(resolve => { release = resolve; }); release = null; }
  if (id === 'updateTask' && fail) { const code = fail; fail = null; throw new StudioApiError({ error: { code, message: code === 'CONFLICT' ? 'The task changed. Review and try again.' : 'Changes could not be saved.' } }); }
  return raw.execute(id, input as OperationInput<typeof id>, options);
});
const queryClient = createStudioQueryClient();
declare global { interface Window { __timelineQA: { client: typeof client; queryClient: typeof queryClient; calls: typeof calls; failNext(code?: 'CONFLICT' | 'INTERNAL_ERROR'): void; holdNext(): void; release(): void } } }
window.__timelineQA = { client, queryClient, calls, failNext: (code = 'CONFLICT') => { fail = code; }, holdNext: () => { held = true; }, release: () => release?.() };
export function Harness() {
  const opener = useRef<HTMLElement | null>(null), [opened, setOpened] = useState(''), [form, setForm] = useState<TaskFormIntent>({ open: false, generation: 0 }), [menu, setMenu] = useState<TaskMenuIntent | null>(null);
  const session = useStudioQuery('getSession', {}), bootstrap = useStudioQuery('getBootstrap', { workspaceId: session.data?.data.currentWorkspaceId ?? '019a6257-0480-7000-8000-000000000001' });
  if (!session.data || !bootstrap.data) return <div>Loading…</div>;
  const data = bootstrap.data.data, project = data.projects.find(row => row.access === 'allowed')!.project, projectScope = params.get('scope') === 'project';
  const grouping = params.get('group') ?? (projectScope ? 'status' : 'project'), date = calendarDateParam(params.get('today')), weekStart = Number(params.get('weekStart') ?? data.preferences.weekStart);
  return <><TimelinePage workspaceId={session.data.data.currentWorkspaceId} scope={projectScope ? { kind: 'project', projectId: project.id } : { kind: 'workspace' }} showHeading={!projectScope} initialZoom={(params.get('zoom') === 'month' ? 'month' : 'week') as TimelineZoom} initialGrouping={(['status', 'assignee', 'project', 'none'].includes(grouping) ? grouping : 'status') as TimelineGrouping} {...(date ? { today: date } : {})} weekStart={([0, 1, 6].includes(weekStart) ? weekStart : 1) as WeekStart} onTaskOpen={id => { opener.current = document.activeElement as HTMLElement; setOpened(id); }} onTaskMenu={(taskId, anchor, point) => setMenu({ taskId, anchor, point })} onNewTask={defaults => setForm(current => ({ open: true, generation: current.generation + 1, defaults }))} /><TaskOverlayHost data={data} {...(opened ? { taskId: opened } : {})} onTaskOpen={setOpened} onTaskClose={() => setOpened('')} opener={opener} form={form} onFormChange={setForm} menu={menu} onMenuChange={setMenu} onProjectOpen={() => setOpened('')} /><output data-open-task hidden>{opened}</output></>;
}
const root = document.getElementById('root'); if (!root) throw new Error('Missing timeline root');
createRoot(root).render(<StrictMode><ThemeProvider><StudioDataProvider runtime={{ client, clock: fixtureClock }} queryClient={queryClient}><OverlayProvider><Harness /></OverlayProvider></StudioDataProvider></ThemeProvider></StrictMode>);
