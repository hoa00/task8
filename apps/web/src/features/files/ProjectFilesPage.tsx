import { captureIntent } from '../../data/operations';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { fileTypeCatalog } from './file-types';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { validateRouteSearch } from '../../app/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Menu,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Field,
  Icon,
  Input,
  MenuItem,
  MenuSeparator,
  Select,
} from '@studio/ui';
import type { OverlayPoint } from '@studio/ui';
import { TaskQuerySchema } from '@studio/contracts/api';
import type { FileDto } from '@studio/contracts/api';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useDataRuntime } from '../../data/context';
import { studioQueryOptions, useStudioQuery } from '../../data/queries';
import { operationQueryKey } from '../../data/query-keys';
import { invalidateOperation } from '../../data/invalidation';
import { useProjectView } from '../projects/project-view';
import { useProjectIntents } from '../projects/project-intents';
import { useTaskListDataset } from '../tasks/useTaskListDataset';
import { useCompleteMembers } from '../people/catalogue';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
import { Dropzone, UploadProgress } from './FileFoundation';
import { useFileIntents } from './file-intents';
import { FileCatalogue } from './FileCatalogue';
import { loadFileCatalogue } from './loadFileCatalogue';
interface CatalogueUpload {
  id: string;
  file: File;
  percent: number;
  status: 'uploading' | 'committing' | 'failed';
  error: string;
}
export function ProjectFilesPage() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    data = useWorkspaceBootstrap().data!.data,
    { projectId } = useProjectView(),
    { client, clock } = useDataRuntime(),
    cache = useQueryClient(),
    fileIntents = useFileIntents(),
    tasks = useWorkspaceIntents(),
    projects = useProjectIntents(),
    commands = useTaskListCommands(workspaceId),
    session = useStudioQuery('getSession', {});
  const location = useLocation(),
    navigate = useNavigate(),
    search = validateRouteSearch(location.search),
    q = search.q ?? '',
    type = search.fileType ?? 'all',
    sort = search.fileSort ?? 'recent',
    mode = search.mode === 'list' ? 'list' : 'grid';
  const change = (patch: {
    q?: string;
    fileType?: string | undefined;
    fileSort?: 'recent' | 'name' | 'type';
    mode?: 'grid' | 'list';
  }) => {
    void navigate({
      to: location.pathname,
      search: (previous) => validateRouteSearch({ ...previous, ...patch }),
      replace: true,
    });
  };
  const [menu, setMenu] = useState<{
      file: FileDto;
      anchor: HTMLElement;
      point?: OverlayPoint;
    } | null>(null),
    [form, setForm] = useState<{ file: FileDto; kind: 'rename' | 'delete' } | null>(null),
    [name, setName] = useState(''),
    [jobs, setJobs] = useState<readonly CatalogueUpload[]>([]);
  const uploadInput = useRef<HTMLInputElement>(null),
    controllers = useRef(new Map<string, AbortController>()),
    busy = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    const jobs = controllers.current;
    return () => {
      active.current = false;
      for (const controller of jobs.values()) controller.abort();
    };
  }, []);
  const input = { workspaceId, projectId, query: { q, ...(type !== 'all' ? { type } : {}), sort } },
    files = useQuery({
      queryKey: [...operationQueryKey('listProjectFiles', input), 'complete'],
      queryFn: ({ signal }) => loadFileCatalogue(client, input, signal),
    }),
    taskQuery = useTaskListDataset(workspaceId, TaskQuerySchema.parse({ projectId })),
    members = useCompleteMembers(workspaceId);
  const formQuery = useQuery({
    ...studioQueryOptions(client, 'getFile', {
      workspaceId,
      fileId: form?.file.id ?? data.workspace.id,
    }),
    enabled: !!form,
  });
  const consume = () => projects.projectSurfaceOpened(),
    currentMenu =
      menu && !files.isError ? files.data?.find((file) => file.id === menu.file.id) : null,
    currentForm = form && !formQuery.isError ? formQuery.data?.data : null;
  function openMenu(file: FileDto, anchor: HTMLElement, point?: OverlayPoint) {
    if (busy.current || commands.pending) return;
    consume();
    commands.clearError();
    setMenu({ file, anchor, ...(point ? { point } : {}) });
  }
  async function upload(job: CatalogueUpload) {
    if (controllers.current.has(job.id)) return;
    const controller = new AbortController();
    controllers.current.set(job.id, controller);
    setJobs((rows) =>
      rows.map((row) =>
        row.id === job.id ? { ...row, status: 'uploading', percent: 0, error: '' } : row,
      ),
    );
    const intentClient = captureIntent(client);
    try {
      if (
        session.data?.data.capabilities.dataMode === 'http' &&
        session.data.data.capabilities.features.fileBytes !== 'implemented'
      )
        throw Error('File upload is unavailable here.');
      if (job.file.size > 10485760) throw Error('File exceeds 10 MiB');
      if (session.data?.data.capabilities.dataMode === 'mock')
        for (const percent of [15, 35, 60, 85]) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              controller.signal.removeEventListener('abort', abort);
              resolve();
            }, 180);
            const abort = () => {
              clearTimeout(timer);
              reject(new DOMException('Cancelled', 'AbortError'));
            };
            controller.signal.addEventListener('abort', abort, { once: true });
          });
          if (controller.signal.aborted) return;
          setJobs((rows) => rows.map((row) => (row.id === job.id ? { ...row, percent } : row)));
        }
      const bytes = new Uint8Array(await job.file.arrayBuffer());
      if (controller.signal.aborted) return;
      setJobs((rows) =>
        rows.map((row) =>
          row.id === job.id ? { ...row, status: 'committing', percent: 95 } : row,
        ),
      );
      const body = {
        clientRequestId: job.id,
        file: { name: job.file.name, mimeType: job.file.type || 'application/octet-stream', bytes },
      };
      await intentClient.execute('uploadProjectFile', { workspaceId, projectId, body });
      await invalidateOperation(cache, 'uploadProjectFile', { workspaceId, projectId, body });
      if (active.current) setJobs((rows) => rows.filter((row) => row.id !== job.id));
    } catch (error) {
      if (controller.signal.aborted) return;
      if (active.current)
        setJobs((rows) =>
          rows.map((row) =>
            row.id === job.id
              ? {
                  ...row,
                  status: 'failed',
                  error: error instanceof Error ? error.message : t('Upload failed'),
                }
              : row,
          ),
        );
    } finally {
      controllers.current.delete(job.id);
    }
  }
  function choose(selected: readonly File[]) {
    consume();
    const next = selected.map((file) => ({
      id: crypto.randomUUID(),
      file,
      percent: 0,
      status: 'uploading' as const,
      error: '',
    }));
    setJobs((rows) => [...rows, ...next]);
    for (const job of next) void upload(job);
  }
  function cancel(job: CatalogueUpload) {
    if (job.status === 'committing') return;
    controllers.current.get(job.id)?.abort();
    setJobs((rows) => rows.filter((row) => row.id !== job.id));
  }
  async function submit() {
    if (!form || !currentForm || busy.current) return;
    busy.current = true;
    try {
      const result =
        form.kind === 'rename'
          ? await commands.run('renameFile', {
              workspaceId,
              fileId: currentForm.id,
              body: { expectedVersion: form.file.version, name },
            })
          : await commands.run('deleteFile', {
              workspaceId,
              fileId: currentForm.id,
              body: { expectedVersion: form.file.version },
            });
      if (result) {
        setForm(null);
        if ('undo' in result.data) fileIntents.deleted(form.file, result.data.undo);
      } else {
        await files.refetch();
        const latest = await formQuery.refetch();
        if (latest.data && !latest.isError)
          setForm((current) =>
            current?.file.id === form.file.id ? { ...current, file: latest.data!.data } : current,
          );
      }
    } finally {
      busy.current = false;
    }
  }
  return (
    <div data-project-files className="contents">
      <div
        data-file-toolbar
        className="flex min-h-[44px] flex-wrap items-center gap-1 border-0 border-b border-solid border-border px-[var(--gutter)] py-2"
      >
        <div className="relative flex items-center">
          <Icon
            name="search"
            size={13}
            className="pointer-events-none absolute left-[9px] text-faint"
          />
          <Input
            size="sm"
            aria-label={t('Search files')}
            placeholder={t('Search files')}
            value={q}
            maxLength={500}
            className="w-[200px]! pl-[30px]!"
            onChange={(event) => {
              consume();
              change({ q: event.target.value });
            }}
          />
        </div>
        <Select
          label={t('Filter by type')}
          value={type}
          onValueChange={(value) => {
            consume();
            change({ fileType: value === 'all' ? undefined : value });
          }}
          className="h-[26px]! w-auto! text-[12px]!"
          options={[
            { value: 'all', label: t('All types') },
            ...Object.entries(fileTypeCatalog)
              .filter(([key]) => key !== 'other')
              .map(([value, item]) => ({ value, label: t(item.name) })),
          ]}
        />
        <Select
          label={t('Sort')}
          value={sort}
          onValueChange={(value) => {
            consume();
            change({ fileSort: value as typeof sort });
          }}
          className="h-[26px]! w-auto! text-[12px]!"
          options={[
            { value: 'recent', label: t('Sort: Newest') },
            { value: 'name', label: t('Sort: Name') },
            { value: 'type', label: t('Sort: Type') },
          ]}
        />
        <span className="flex-1" />
        <div className="flex gap-[2px] rounded-sm bg-surface-3 p-[2px]">
          {(['grid', 'list'] as const).map((value) => (
            <button
              key={value}
              aria-label={t('{{value1}} view', { value1: String(value) })}
              aria-pressed={mode === value}
              className="inline-flex h-[24px] items-center justify-center rounded-[5px] px-[9px] text-secondary aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:[box-shadow:0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_var(--border)]"
              onClick={() => {
                consume();
                change({ mode: value });
              }}
            >
              <Icon name={value === 'grid' ? 'layout-grid' : 'list'} size={13} />
            </button>
          ))}
        </div>
        <Button variant="primary" size="sm" onClick={() => uploadInput.current?.click()}>
          <Icon name="upload" size={13} />
          {t('Upload')}
        </Button>
        <input
          ref={uploadInput}
          type="file"
          multiple
          hidden
          aria-label={t('Upload project files')}
          onChange={(event) => {
            choose([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </div>
      <div
        data-file-page
        className="mx-auto max-w-none px-[var(--gutter)] pt-4 pb-[72px] source-tablet:pb-24"
      >
        <div className="mb-4">
          <Dropzone
            icon="upload-cloud"
            padding={18}
            onFiles={choose}
            ariaLabel={t('Browse project files')}
            label={
              <>
                {t('Drop files here or')}{' '}
                <span className="font-medium text-accent source-hover:underline [text-underline-offset:3px]">
                  {t('browse')}
                </span>
                {'  '}
                {t('— up to')}{' '}
                {session.data?.data.capabilities.dataMode === 'http' ? t('10 MiB') : t('250 MB')}
                {'  '}
                {t('each')}
              </>
            }
          />
        </div>
        {!!jobs.length && (
          <div className="mb-4 flex flex-col gap-[6px]" data-file-uploads>
            {session.data?.data.capabilities.dataMode === 'mock' && (
              <span className="sr-only">
                {t('Mock progress simulates metadata upload; original file bytes are not stored.')}
              </span>
            )}
            {jobs.map((job) => (
              <div key={job.id} data-upload-id={job.id}>
                <UploadProgress
                  name={job.file.name}
                  percent={session.data?.data.capabilities.dataMode === 'http' ? null : job.percent}
                  catalogue
                />
                {job.status === 'failed' && (
                  <Alert tone="danger">
                    {job.error}
                    <Button
                      size="sm"
                      onClick={() => {
                        void upload(job);
                      }}
                    >
                      {t('Retry')}
                    </Button>
                  </Alert>
                )}
                <Button
                  size="sm"
                  className="mt-[6px]"
                  disabled={job.status === 'committing'}
                  onClick={() => cancel(job)}
                >
                  {t('Cancel')} {job.file.name}
                </Button>
              </div>
            ))}
          </div>
        )}
        {files.isError || taskQuery.isError || members.isError ? (
          <Alert tone="danger">
            {t('Files could not be loaded.')}
            <Button
              onClick={() => {
                void files.refetch();
                void taskQuery.refetch();
                void members.refetch();
              }}
            >
              {t('Retry')}
            </Button>
          </Alert>
        ) : !files.data || !taskQuery.data || !members.data ? (
          <div role="status">{t('Loading files…')}</div>
        ) : (
          <div data-files-ready>
            {files.data.length ? (
              <FileCatalogue
                files={files.data}
                members={members.data.items}
                tasks={taskQuery.data}
                mode={mode}
                now={clock.now()}
                onPreview={fileIntents.openFile}
                onMenu={openMenu}
                onTaskOpen={tasks.openTask}
              />
            ) : (
              <EmptyState
                icon={q || type !== 'all' ? 'search-x' : 'folder-open'}
                heading={q || type !== 'all' ? t('No results found') : t('No files yet')}
                description={
                  q || type !== 'all'
                    ? t('No files match your search.')
                    : t('Upload designs, documents, and assets to share them with the project.')
                }
              />
            )}
          </div>
        )}
      </div>
      {menu && (
        <Menu
          open
          className="file-catalogue-menu"
          label={t('File actions')}
          anchor={{ current: menu.anchor }}
          {...(menu.point ? { point: menu.point } : {})}
          onOpenChange={(open) => {
            if (!open) setMenu(null);
          }}
        >
          {currentMenu ? (
            <>
              <MenuItem
                icon={<Icon name="eye" size={15} />}
                onSelect={() => {
                  setMenu(null);
                  fileIntents.openFile(currentMenu);
                }}
              >
                {t('Preview')}
              </MenuItem>
              <MenuItem
                disabled={commands.pending}
                icon={<Icon name="pencil" size={15} />}
                onSelect={() => {
                  setMenu(null);
                  setForm({ file: currentMenu, kind: 'rename' });
                  setName(currentMenu.name);
                }}
              >
                {t('Rename')}
              </MenuItem>
              <MenuItem
                icon={<Icon name="link" size={15} />}
                onSelect={() => {
                  setMenu(null);
                  fileIntents.copyFile(currentMenu);
                }}
              >
                {t('Copy link')}
              </MenuItem>
              <MenuItem
                disabled={commands.pending}
                icon={<Icon name="copy" size={15} />}
                onSelect={() => {
                  void commands
                    .run('duplicateFile', {
                      workspaceId,
                      fileId: currentMenu.id,
                      body: { expectedVersion: currentMenu.version },
                    })
                    .then((result) => {
                      if (result) {
                        setMenu(null);
                        projects.notice('File duplicated');
                      }
                    });
                }}
              >
                {t('Duplicate')}
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                disabled={commands.pending}
                danger
                icon={<Icon name="trash-2" size={15} />}
                onSelect={() => {
                  setMenu(null);
                  setForm({ file: currentMenu, kind: 'delete' });
                }}
              >
                {t('Delete')}
              </MenuItem>
            </>
          ) : (
            <Alert tone="danger">{t('This file is unavailable.')}</Alert>
          )}
          {commands.error && <Alert tone="danger">{commands.error}</Alert>}
        </Menu>
      )}
      {form && (
        <Dialog
          open
          size="sm"
          entryRevision={commands.error}
          aria-labelledby="file-form-title"
          data-file-form={form.kind}
          onOpenChange={(open) => {
            if (!open && !busy.current && !commands.pending) setForm(null);
          }}
        >
          {form.kind === 'rename' && (
            <DialogHeader
              titleId="file-form-title"
              title={form.kind === 'rename' ? t('Rename file') : t('Delete file?')}
              description=""
              onClose={() => {
                if (!busy.current && !commands.pending) setForm(null);
              }}
            />
          )}
          <DialogBody
            className={form.kind === 'delete' ? 'pt-[18px]! gap-[10px]!' : ''}
            as="form"
            id="file-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {currentForm ? (
              form.kind === 'rename' ? (
                <Field label={t('File name')} controlId="file-name">
                  <Input
                    id="file-name"
                    value={name}
                    required
                    maxLength={200}
                    disabled={commands.pending}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-[color-mix(in_srgb,var(--red)_13%,transparent)] text-red">
                    <Icon name="trash-2" size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 id="file-form-title" className="mt-1 mb-[6px] text-[15px] font-semibold">
                      {t('Delete file?')}
                    </h2>
                    <p className="m-0 text-[13px] leading-[1.55] text-secondary">
                      <b>{form.file.name}</b>
                      {'  '}
                      {t('will be removed from the project')}
                      {form.file.taskId ? t('and its task') : ''}
                      {'.'}
                    </p>
                  </div>
                </div>
              )
            ) : (
              <Alert tone="danger">{t('This file is unavailable.')}</Alert>
            )}
            {commands.error && <Alert tone="danger">{commands.error}</Alert>}
          </DialogBody>
          <DialogFooter>
            <span className="flex-1" />
            <Button disabled={commands.pending} onClick={() => setForm(null)}>
              {t('Cancel')}
            </Button>
            <Button
              type="submit"
              form="file-form"
              variant={form.kind === 'delete' ? 'danger' : 'primary'}
              disabled={
                !currentForm || commands.pending || (form.kind === 'rename' && !name.trim())
              }
              loading={commands.pending}
            >
              {form.kind === 'rename' ? t('Save') : t('Delete file')}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
