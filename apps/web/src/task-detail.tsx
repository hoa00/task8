import { StrictMode, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, OverlayProvider, ToastViewport } from '@studio/ui';
import { sourceId } from '@studio/contracts/source-identities';
import { DateOnlySchema } from '@studio/contracts/api';
import { normalizeDescription } from '@studio/domain';
import type { OperationId, OperationInput } from '@studio/contracts/api';
import { createMockClient } from './data/adapters/mock';
import { browserMockStorage, persistMockDataset } from './data/mock/persistence';
import { createStudioClient } from './data/operations';
import { StudioApiError } from './data/errors';
import { StudioDataProvider } from './data/StudioDataProvider';
import { fixtureClock, createSeedDataset } from './data/mock/seed';
import { createStudioQueryClient, studioQueryOptions, useStudioQuery } from './data/queries';
import { commentQueryOptions, activityQueryOptions } from './features/comments/queries';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyRootPreferences, readThemePreferences } from './theme/preferences';
import { TaskOverlayHost } from './features/tasks/detail/TaskOverlayHost';
import type { TaskFormIntent, TaskMenuIntent } from './features/tasks/detail/TaskOverlayHost';
import { TaskDrawer } from './features/tasks/detail/TaskDrawer';
import type { TaskDrawerDraft } from './features/tasks/detail/TaskDrawer';
import { TaskFormDialog } from './features/tasks/detail/TaskFormDialog';
import {
  AttachmentCard,
  Dropzone,
  FilePreviewArt,
  UploadProgress,
} from './features/files/FileFoundation';
import { FilePreviewDialog } from './features/files/FilePreviewDialog';
import './styles/app.css';
applyRootPreferences(readThemePreferences());
const params = new URLSearchParams(location.search),
  workspaceId = sourceId('workspaces', 'w1'),
  targetId = sourceId('tasks', 't3'),
  storage = browserMockStorage();
if (params.get('empty') === '1' || params.get('subfilled') === '1' || params.get('rich') === '1') {
  const seed = createSeedDataset(fixtureClock);
  if (params.get('empty') === '1') {
    for (const row of Object.values(seed.comments))
      if (row.taskId === targetId) delete seed.comments[row.id];
    for (const row of Object.values(seed.files))
      if (row.taskId === targetId) delete seed.files[row.id];
    seed.tasks[targetId]!.commentCount = 0;
    seed.tasks[targetId]!.attachmentCount = 0;
  }
  if (params.get('subfilled') === '1') {
    const child = Object.values(seed.subtasks).find((row) => row.taskId === targetId)!;
    child.done = false;
    child.assigneeId = sourceId('members', 'm2');
    child.dueDate = DateOnlySchema.parse('2026-10-10');
    child.note = 'Confirm layout and acceptance criteria.';
    seed.tasks[targetId]!.subtaskSummary.completed--;
  }
  if (params.get('rich') === '1')
    seed.tasks[targetId]!.descriptionHtml = normalizeDescription(
      '<h4>Release plan</h4><p><strong>Bold</strong> and <em>italic</em>. <a href="https://example.com">Plan</a></p><ul><li>Check</li></ul><ol><li>Ship</li></ol>',
    ).html;
  persistMockDataset(storage, seed);
}
const raw = createMockClient({ environment: 'test', ...(storage ? { storage } : {}) });
let failure: OperationId | null = null,
  lost: OperationId | null = null,
  hold: OperationId | null = null,
  release: (() => void) | null = null;
const events: string[] = [];
const client = createStudioClient(async (id, input, options) => {
  events.push(`${id}:begin`);
  if (hold === id) {
    hold = null;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    release = null;
  }
  if (failure === id) {
    failure = null;
    events.push(`${id}:failed`);
    throw new StudioApiError({
      error: { code: 'CONFLICT', message: 'Verification request failed' },
    });
  }
  const result = await raw.execute(id, input as OperationInput<typeof id>, options);
  if (lost === id) {
    lost = null;
    throw Error('Verification lost response');
  }
  events.push(`${id}:confirmed`);
  return result;
});
const cache = createStudioQueryClient();
declare global {
  interface Window {
    __taskDetailQA: {
      client: typeof client;
      cache: typeof cache;
      fail(id: OperationId): void;
      lose(id: OperationId): void;
      hold(id: OperationId): void;
      release(): void;
      held(): boolean;
      events: string[];
      isolateDrawer?: () => void;
    };
  }
}
window.__taskDetailQA = {
  client,
  cache,
  fail: (id) => {
    failure = id;
  },
  lose: (id) => {
    lost = id;
  },
  hold: (id) => {
    hold = id;
  },
  release: () => release?.(),
  held: () => !!release,
  events,
};
for (const [id, input] of [
  ['getBootstrap', { workspaceId }],
  ['getTask', { workspaceId, taskId: targetId }],
  ['listTasks', { workspaceId, query: { limit: 200 } }],
] as const)
  await cache.prefetchQuery(studioQueryOptions(client, id, input));
await cache.prefetchInfiniteQuery(commentQueryOptions(client, workspaceId, targetId));
await cache.prefetchInfiniteQuery(activityQueryOptions(client, workspaceId, targetId));
await cache.prefetchQuery(
  studioQueryOptions(client, 'listMembers', { workspaceId, query: { limit: 200 } }),
);
function SubtaskSnapshot({
  data,
  detail,
  tasks,
}: {
  data: Parameters<typeof TaskDrawer>[0]['data'];
  detail: Parameters<typeof TaskDrawer>[0]['detail'];
  tasks: Parameters<typeof TaskDrawer>[0]['tasks'];
}) {
  const [draft, setDraft] = useState<TaskDrawerDraft>({
      title: '',
      titleDirty: false,
      scrollTop: 0,
      ...(params.get('kind') === 'sub' ? { subtaskId: detail.subtasks[0]!.id } : {}),
      ...(params.get('draft') ? { comment: params.get('draft')! } : {}),
    }),
    opener = useRef<HTMLElement | null>(null);
  return (
    <>
      <TaskDrawer
        data={data}
        detail={detail}
        tasks={tasks}
        full={false}
        onFullChange={() => {}}
        openField={null}
        onOpenFieldChange={() => {}}
        onClose={() => {}}
        returnFocus={opener}
        onMenu={() => {}}
        onProjectOpen={() => {}}
        onCopy={() => {}}
        onUndo={() => {}}
        onNotice={() => {}}
        onPromoted={() => {}}
        draft={draft}
        onDraftChange={(patch) => setDraft((value) => ({ ...value, ...patch }))}
        onUpload={() => {}}
        uploads={
          params.get('upload') === '1'
            ? [
                {
                  id: 'qa-upload',
                  taskId: detail.task.id,
                  name: 'Composer-upload.txt',
                  status: 'uploading',
                },
              ]
            : []
        }
        onRetry={() => {}}
        onRemove={() => {}}
        onPreview={() => {}}
      />
      {params.get('error') === '1' && (
        <ToastViewport
          items={[
            {
              id: 'qa-error',
              message: "Your changes couldn't be saved. You're offline.",
              kind: 'error',
              duration: 0,
            },
          ]}
          onDismiss={() => {}}
        />
      )}
    </>
  );
}
export function Harness() {
  const bootstrap = useStudioQuery('getBootstrap', { workspaceId }),
    detail = useStudioQuery('getTask', { workspaceId, taskId: targetId }),
    list = useStudioQuery('listTasks', { workspaceId, query: { limit: 200 } });
  const opener = useRef<HTMLElement | null>(null),
    [opened, setOpened] = useState(params.get('kind') === 'drawer' ? targetId : ''),
    [form, setForm] = useState<TaskFormIntent>({ open: false, generation: 0 }),
    [menu, setMenu] = useState<TaskMenuIntent | null>(null),
    [preview, setPreview] = useState(false),
    [owned, setOwned] = useState(false);
  useLayoutEffect(() => {
    const isolate = () => setOwned(true);
    window.__taskDetailQA.isolateDrawer = isolate;
    return () => {
      if (window.__taskDetailQA.isolateDrawer === isolate)
        delete window.__taskDetailQA.isolateDrawer;
    };
  }, []);
  if (!bootstrap.data || !detail.data || !list.data) return <div>{'Loading…'}</div>;
  const data = {
      ...bootstrap.data.data,
      preferences: {
        ...bootstrap.data.data.preferences,
        openTasks: params.get('full') === '1' ? ('full' as const) : ('drawer' as const),
      },
    },
    tasks = list.data.data.items,
    file = detail.data.data.attachments[0]!;
  if (params.get('kind') === 'sub' || params.get('kind') === 'snapshot')
    return <SubtaskSnapshot data={data} detail={detail.data.data} tasks={tasks} />;
  if (params.get('kind') === 'form')
    return (
      <TaskFormDialog
        open
        data={data}
        tasks={tasks}
        {...(params.get('edit') === '1' ? { detail: detail.data.data } : {})}
        {...(params.get('state')
          ? { initialState: params.get('state') as 'filled' | 'error' | 'loading' }
          : {})}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    );
  if (params.get('kind') === 'attachment')
    return (
      <section
        id="attachment-sample"
        style={{
          width:
            params.get('state') === 'existing'
              ? innerWidth <= 640
                ? 175
                : 185
              : innerWidth <= 640
                ? 358
                : 571,
          margin: innerWidth <= 640 ? 16 : 24,
        }}
      >
        {params.get('state') === 'empty' ? (
          <Dropzone onFiles={() => {}} />
        ) : params.get('state') === 'uploading' ? (
          <UploadProgress name="Launch-assets.fig" percent={42} />
        ) : (
          <AttachmentCard file={file} onPreview={() => setPreview(true)} onRemove={() => {}} />
        )}
        {preview && (
          <FilePreviewDialog
            file={file}
            now={fixtureClock.now()}
            onClose={() => setPreview(false)}
            onTaskOpen={() => {}}
            onCopy={() => {}}
          />
        )}
      </section>
    );
  if (params.get('kind') === 'art')
    return (
      <div id="art-sample" className="w-[300px]">
        <FilePreviewArt
          name={`Sample.${params.get('ext') ?? 'pdf'}`}
          type={params.get('type') ?? 'pdf'}
        />
      </div>
    );
  if (params.get('kind') === 'preview')
    return (
      <FilePreviewDialog
        file={file}
        now={fixtureClock.now()}
        author={data.members.find((member) => member.id === file.createdBy)?.name ?? 'you'}
        taskTitle={detail.data.data.task.title}
        onClose={() => {}}
        onTaskOpen={() => {}}
        onCopy={() => {}}
      />
    );
  return (
    <>
      <div hidden={params.has('kind')} className="p-6">
        <Button
          onClick={(event) => {
            opener.current = event.currentTarget;
            setOpened(targetId);
          }}
        >
          {'Open task'}
        </Button>
        <Button onClick={() => setOpened(tasks.find((task) => task.id !== targetId)!.id)}>
          {'Open another task'}
        </Button>
        <Button onClick={() => setForm({ open: true, generation: form.generation })}>
          {'New task'}
        </Button>
        <Button
          onClick={() => setForm({ open: true, taskId: targetId, generation: form.generation + 1 })}
        >
          {'Edit task'}
        </Button>
      </div>
      <TaskOverlayHost
        {...(owned ? { drawerSections: null } : {})}
        data={data}
        {...(opened ? { taskId: opened } : {})}
        onTaskOpen={setOpened}
        onTaskClose={() => setOpened('')}
        opener={opener}
        form={form}
        onFormChange={(next) => {
          events.push(`form:${JSON.stringify(next)}`);
          setForm(next);
        }}
        menu={menu}
        onMenuChange={setMenu}
        onProjectOpen={() => setOpened('')}
      />
    </>
  );
}
for (const family of ['Geist', 'Geist Mono'])
  for (const weight of [400, 500, 600]) await document.fonts.load(`${weight} 13.5px "${family}"`);
await document.fonts.ready;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <StudioDataProvider runtime={{ client, clock: fixtureClock }} queryClient={cache}>
        <OverlayProvider {...(params.has('kind') ? { initialState: 'settled' as const } : {})}>
          <Harness />
        </OverlayProvider>
      </StudioDataProvider>
    </ThemeProvider>
  </StrictMode>,
);
