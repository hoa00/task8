import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Dialog, DialogBody, ToastViewport } from '@studio/ui';
import { EntityIdSchema } from '@studio/contracts/api';
import type { ToastMessage } from '@studio/ui';
import type { BootstrapDto, UndoDescriptorDto } from '@studio/contracts/api';
import { links, validateRouteSearch } from '../../app/navigation';
import { useDataRuntime } from '../../data/context';
import { studioQueryOptions } from '../../data/queries';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useTaskListCommands } from '../tasks/useTaskListCommands';
import { useCompleteMembers } from '../people/catalogue';
import { useTheme } from '../../theme/theme-context';
import { FilePreviewDialog } from './FilePreviewDialog';
import { FileIntentContext } from './file-intents';
export interface FileOverlayHostProps {
  data: BootstrapDto;
  children: ReactNode;
}
function subscribeReducedMotion(callback: () => void) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
export function FileOverlayHost({ data, children }: FileOverlayHostProps) {
  useTranslation();
  const previewRef = useRef<HTMLElement>(null),
    { preferences } = useTheme(),
    osReduced = useSyncExternalStore(
      subscribeReducedMotion,
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      () => false,
    ),
    reduced = preferences.motion === 'reduce' || (preferences.motion === 'system' && osReduced);
  const [copyMotion, setCopyMotion] = useState<{ fileId: string; revision: number } | null>(null);
  useLayoutEffect(() => {
    if (!copyMotion || !reduced || previewRef.current?.dataset.filePreview !== copyMotion.fileId)
      return;
    /* Source's unconditional reduced fade replays on Copy render:120ms/ease/fillnone. Keep the same node/focus and shared default Dialog. */ const animation =
      previewRef.current.animate(
        [
          { opacity: '0', offset: 0, easing: 'ease' },
          { opacity: '1', offset: 1, easing: 'ease' },
        ],
        { duration: 120, fill: 'none' },
      );
    return () => animation.cancel();
  }, [copyMotion, reduced]);

  const [toasts, setToasts] = useState<ToastMessage[]>([]),
    [retryUndo, setRetryUndo] = useState<UndoDescriptorDto | null>(null),
    commands = useTaskListCommands(data.workspace.id);
  async function undo(descriptor: UndoDescriptorDto) {
    const result = await commands.undo(descriptor);
    setRetryUndo(result ? null : descriptor);
  }
  const { client, clock } = useDataRuntime(),
    location = useLocation(),
    navigate = useNavigate(),
    tasks = useWorkspaceIntents(),
    projects = useAppServices(),
    search = validateRouteSearch(location.search);
  const route = location.pathname.match(/^\/w\/([^/]+)\/projects\/([^/]+)\/files$/),
    projectId = route?.[2],
    requested = !!route && new URLSearchParams(location.searchStr).has('fileId'),
    fileId = search.fileId;
  const scopedRoute =
    route?.[1] === data.workspace.id && EntityIdSchema.safeParse(projectId).success;
  const fileQuery = useQuery({
    ...studioQueryOptions(client, 'getFile', {
      workspaceId: data.workspace.id,
      fileId: fileId ?? data.workspace.id,
    }),
    enabled: requested && scopedRoute && !!fileId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const parent = useQuery({
    ...studioQueryOptions(client, 'getProject', {
      workspaceId: data.workspace.id,
      projectId: projectId ?? data.workspace.id,
    }),
    enabled: requested && scopedRoute,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const parentRecord = parent.data?.data,
    parentInvalid =
      !!parentRecord &&
      (parentRecord.id !== projectId ||
        parentRecord.workspaceId !== data.workspace.id ||
        !!parentRecord.archivedAt);
  const record = fileQuery.data?.data,
    file =
      requested &&
      scopedRoute &&
      !!record &&
      record.id === fileId &&
      record.workspaceId === data.workspace.id &&
      record.projectId === projectId &&
      !fileQuery.isError &&
      !parent.isError &&
      !fileQuery.isFetching &&
      !parent.isFetching &&
      parentRecord &&
      !parentInvalid
        ? record
        : null;
  const members = useCompleteMembers(data.workspace.id);
  const taskQuery = useQuery({
    ...studioQueryOptions(client, 'getTask', {
      workspaceId: data.workspace.id,
      taskId: file?.taskId ?? data.workspace.id,
    }),
    enabled: !!file?.taskId,
  });
  const close = () => {
    projects.surfaceOpened();
    void navigate({
      to: location.pathname,
      resetScroll: false,
      search: (previous) => {
        const next = { ...previous };
        delete next.fileId;
        return next;
      },
      replace: true,
    });
  };
  const copy = (url: string) => {
    projects.surfaceOpened();
    if (file)
      setCopyMotion((previous) => ({ fileId: file.id, revision: (previous?.revision ?? 0) + 1 }));
    void navigator.clipboard.writeText(url).then(
      () => projects.notice('Link copied', undefined, { duration: 4200 }),
      () =>
        projects.notice("Copy isn't available here — " + url, undefined, {
          kind: 'info',
          duration: 6000,
        }),
    );
  };
  const denied =
    !scopedRoute ||
    !fileId ||
    fileQuery.isError ||
    parent.isError ||
    parentInvalid ||
    (!!record &&
      (record.id !== fileId ||
        record.workspaceId !== data.workspace.id ||
        record.projectId !== projectId));
  return (
    <FileIntentContext
      value={{
        deleted: (file, descriptor) => {
          setToasts((rows) => [
            {
              id: crypto.randomUUID(),
              message: t('Deleted {{value1}}', { value1: String(file.name) }),
              duration: descriptor ? 5000 : 2200,
              ...(descriptor
                ? {
                    action: {
                      label: t('Undo'),
                      onAction: () => {
                        void undo(descriptor);
                      },
                    },
                  }
                : {}),
            },
            ...rows,
          ]);
        },
        openFile: (file) => {
          projects.surfaceOpened();
          if (file.workspaceId === data.workspace.id) {
            const target = links.project(file.workspaceId, file.projectId, 'files');
            void navigate({
              to: target,
              resetScroll: location.pathname !== target,
              search: (previous) => ({
                ...(location.pathname === target ? previous : {}),
                fileId: file.id,
              }),
            });
          }
        },
        copyFile: (file) =>
          copy(
            new URL(links.file(file.workspaceId, file.projectId, file.id), window.location.origin)
              .href,
          ),
      }}
    >
      {children}
      {file && (
        <FilePreviewDialog
          previewRef={previewRef}
          file={file}
          entryRevision={`${file.id}/${projects.surfaceRevision}`}
          now={clock.now()}
          author={
            members.data?.items.find((member) => member.id === file.createdBy)?.name ??
            data.members.find((member) => member.id === file.createdBy)?.name ??
            'you'
          }
          taskTitle={
            taskQuery.isError ? t('Open task') : (taskQuery.data?.data.task.title ?? 'Open task')
          }
          onClose={close}
          onCopy={copy}
          onTaskOpen={(id) => {
            void navigate({
              to: location.pathname,
              resetScroll: false,
              search: (previous) => {
                const next = { ...previous };
                delete next.fileId;
                return next;
              },
              replace: true,
            }).then(() => tasks.openTask(id));
          }}
        />
      )}
      {requested && !file && (
        <Dialog
          open
          size="sm"
          aria-label={t('File preview')}
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <DialogBody>
            {denied ? (
              <Alert tone="danger">{t('This file is unavailable.')}</Alert>
            ) : (
              <div role="status">{t('Loading preview…')}</div>
            )}
            {(fileQuery.isError || parent.isError) && (
              <Button
                onClick={() => {
                  void fileQuery.refetch();
                  void parent.refetch();
                }}
              >
                {t('Retry')}
              </Button>
            )}
            <Button onClick={close}>{t('Close')}</Button>
          </DialogBody>
        </Dialog>
      )}
      {retryUndo && (
        <Alert className="fixed bottom-4 right-4 z-[100]" tone="danger">
          {commands.error}
          <Button
            disabled={commands.pending}
            onClick={() => {
              void undo(retryUndo);
            }}
          >
            {t('Retry Undo')}
          </Button>
        </Alert>
      )}
      <ToastViewport
        items={toasts}
        onDismiss={(id) => setToasts((rows) => rows.filter((row) => row.id !== id))}
      />
    </FileIntentContext>
  );
}
