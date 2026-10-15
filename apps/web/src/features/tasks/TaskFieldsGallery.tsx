import { useState } from 'react';
import { Alert, Button, Select, ToastViewport } from '@studio/ui';
import type { ToastMessage } from '@studio/ui';
import { TaskSchema } from '@studio/contracts/api';
import type { BootstrapDto, EntityId, TaskDto } from '@studio/contracts/api';
import { decodeCurrentTaskView, encodeCurrentTaskView } from './current-view';
import { ControllerRaceProbe } from './ControllerRaceProbe';
import { TaskFields } from './TaskFields';
import { TaskViewToolbar } from './TaskViewToolbar';
import { useTaskFieldCommands } from './useTaskFieldCommands';
import type { TaskFieldValues, TaskFieldTarget } from './field-types';
import { useStudioQuery } from '../../data/queries';
import { useDataRuntime } from '../../data/context';

export function TaskFieldsGallery({
  workspaceId,
  onFailNext,
}: {
  workspaceId: EntityId;
  onFailNext: () => void;
}) {
  const bootstrap = useStudioQuery('getBootstrap', { workspaceId }),
    tasks = useStudioQuery('listTasks', { workspaceId, query: { limit: 200 } });
  const [view, setView] = useState(() => decodeCurrentTaskView(location.search));
  const [selected, setSelected] = useState('');
  if (!bootstrap.data || !tasks.data) return <div>{'Loading task fields…'}</div>;
  const data = bootstrap.data.data,
    collection = tasks.data.data.items;
  const taskId = collection.find((task) => task.id === selected)?.id ?? collection[0]?.id;
  if (!taskId) return <div>{'No tasks available'}</div>;
  const projects = data.projects
    .filter((project) => project.access === 'allowed')
    .map((project) => project.project);
  return (
    <main>
      <section id="task-toolbar-sample">
        <TaskViewToolbar
          value={view}
          onChange={(next) => {
            setView(next);
            const url = new URL(location.href);
            url.searchParams.set(
              'view',
              new URLSearchParams(encodeCurrentTaskView(next)).get('view')!,
            );
            history.replaceState(history.state, '', url);
          }}
          lookups={{ members: data.members, projects, currentMemberId: data.currentMember.id }}
          columns
        />
      </section>
      {new URLSearchParams(location.search).get('visual') !== '1' && (
        <div className="p-6">
          <h1 className="text-md">{'Task fields'}</h1>
          <div className="flex gap-2">
            <Button onClick={onFailNext}>{'Fail next mutation'}</Button>
            <Select
              label="Gallery task"
              className="max-w-[320px]"
              value={taskId}
              options={collection.map((task) => ({ value: task.id, label: task.key }))}
              onValueChange={setSelected}
            />
          </div>
          <RecordFields taskId={taskId} data={data} tasks={collection} />
          <ControllerRaceProbe
            workspaceId={workspaceId}
            taskIds={collection.map((task) => task.id)}
          />
          <DraftFields
            key={taskId}
            task={collection.find((task) => task.id === taskId)!}
            data={data}
            tasks={collection}
          />
        </div>
      )}
    </main>
  );
}
function RecordFields({
  taskId,
  data,
  tasks,
}: {
  taskId: EntityId;
  data: BootstrapDto;
  tasks: readonly TaskDto[];
}) {
  const query = useStudioQuery('getTask', { workspaceId: data.workspace.id, taskId });
  if (!query.data) return <div>{'Loading record…'}</div>;
  return <RecordEditor task={query.data.data.task} data={data} tasks={tasks} />;
}
function RecordEditor({
  task,
  data,
  tasks,
}: {
  task: TaskDto;
  data: BootstrapDto;
  tasks: readonly TaskDto[];
}) {
  const commands = useTaskFieldCommands(task),
    { clock } = useDataRuntime();
  const [open, setOpen] = useState<{ context: string; field: keyof TaskFieldValues } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const projects = data.projects
    .filter((project) => project.access === 'allowed')
    .map((project) => project.project);
  const target: TaskFieldTarget = {
    kind: 'record',
    workspaceId: task.workspaceId,
    taskId: task.id,
  };
  return (
    <section data-record-id={task.id}>
      <h2 className="text-body">
        {'Record '}
        {task.key}
      </h2>
      {(['list-pill', 'drawer-property'] as const).map((context) => (
        <div key={context} data-context={context} className="mb-4">
          <TaskFields
            target={target}
            value={open?.context === context ? { ...task, ...commands.attempt } : task}
            onPatch={(bound, patch) =>
              bound.kind === 'record' && bound.taskId === task.id ? commands.patch(patch) : false
            }
            members={data.members}
            projects={projects}
            tasks={tasks}
            currentMemberId={data.currentMember.id}
            today={clock.today()}
            weekStart={data.preferences.weekStart}
            openField={open?.context === context ? open.field : null}
            onOpenFieldChange={(field) => setOpen(field ? { context, field } : null)}
            presentation={context}
            error={commands.error}
            disabled={commands.pending}
          />
        </div>
      ))}
      {commands.error && <Alert tone="danger">{commands.error}</Alert>}
      <Button
        data-completion
        onClick={async () => {
          const undo = await commands.complete();
          if (undo)
            setToasts([
              {
                id: undo.id,
                message: `Completed “${task.title}”`,
                duration: 0,
                action: {
                  label: 'Undo',
                  onAction: () => {
                    void commands.undo(undo);
                  },
                },
              },
            ]);
        }}
      >
        {task.status === 'done' ? 'Reopen task' : 'Mark complete'}
      </Button>
      <output data-record-status>{task.status}</output>
      <output data-record-version>{task.version}</output>
      <ToastViewport
        items={toasts}
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
    </section>
  );
}
function DraftFields({
  task,
  data,
  tasks,
}: {
  task: TaskDto;
  data: BootstrapDto;
  tasks: readonly TaskDto[];
}) {
  const [draft, setDraft] = useState<TaskFieldValues>(task),
    [open, setOpen] = useState<keyof TaskFieldValues | null>(null),
    [error, setError] = useState('');
  const { clock } = useDataRuntime();
  return (
    <section data-context="draft">
      <h2 className="text-body">{'Draft'}</h2>
      <TaskFields
        target={{ kind: 'draft', draftId: `gallery-${task.id}` }}
        value={draft}
        onPatch={(target, patch) => {
          if (target.kind !== 'draft') return false;
          const next = { ...draft, ...patch };
          setDraft(next);
          const result = TaskSchema.safeParse({
            ...task,
            ...next,
            completedAt: next.status === 'done' ? clock.now() : null,
          });
          setError(result.success ? '' : 'Start date must be on or before due date');
          return result.success;
        }}
        members={data.members}
        projects={data.projects
          .filter((project) => project.access === 'allowed')
          .map((project) => project.project)}
        tasks={tasks}
        currentMemberId={data.currentMember.id}
        today={clock.today()}
        weekStart={data.preferences.weekStart}
        openField={open}
        onOpenFieldChange={setOpen}
        presentation="form-chip"
        error={error}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <output data-draft-status>{draft.status}</output>
    </section>
  );
}
