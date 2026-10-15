import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useQuery } from '@tanstack/react-query';
import { useDataRuntime } from '../../data/context';
import { studioQueryOptions } from '../../data/queries';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { FileDto } from '@studio/contracts/api';
import { Button, Dialog, DialogBody, DialogFooter, Icon, IconButton } from '@studio/ui';
import { FilePreviewArt } from './FileFoundation';
import { links } from '../../app/navigation';
import { ago } from '../tasks/date-display';
import { fileTypeCatalog } from './file-types';

export interface FilePreviewDialogProps {
  previewRef?: RefObject<HTMLElement | null>;
  entryRevision?: string;
  file: FileDto | null;
  author?: string;
  taskTitle?: string;
  now: string;
  onClose: () => void;
  onTaskOpen: (taskId: string) => void;
  onCopy: (url: string) => void;
}
export function FilePreviewDialog({
  file,
  entryRevision,
  previewRef,
  author,
  taskTitle,
  now,
  onClose,
  onTaskOpen,
  onCopy,
}: FilePreviewDialogProps) {
  useTranslation();
  const { client } = useDataRuntime();
  const content = useQuery({
    ...studioQueryOptions(client, 'getFileContent', {
      workspaceId: file?.workspaceId ?? '00000000-0000-7000-8000-000000000000',
      fileId: file?.id ?? '00000000-0000-7000-8000-000000000000',
      query: { disposition: 'inline' },
    }),
    enabled: !!file?.contentAvailable,
    staleTime: 0,
  });
  const imageRef = useRef<HTMLImageElement>(null);
  const previewImage =
    !!file?.contentAvailable &&
    content.data?.disposition === 'inline' &&
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(content.data.contentType);
  useEffect(() => {
    const image = imageRef.current;
    if (!image || !previewImage || !content.data) return;
    const value = URL.createObjectURL(
      new Blob([content.data.bytes.slice().buffer], { type: content.data.contentType }),
    );
    image.src = value;
    return () => {
      image.removeAttribute('src');
      URL.revokeObjectURL(value);
    };
  }, [file?.id, previewImage, content.data]);
  if (!file) return null;
  return (
    <Dialog
      ref={previewRef}
      open
      {...(entryRevision !== undefined ? { entryRevision } : {})}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-labelledby="file-preview-title"
      size="lg"
      data-file-preview={file.id}
    >
      <div className="flex items-center gap-2 px-4 pt-[14px]">
        <div>
          <h2 id="file-preview-title" className="m-0 text-md font-semibold">
            {file.name}
          </h2>
          <div className="mt-[2px] text-[12.5px] text-secondary">
            {t((fileTypeCatalog[file.fileType] ?? fileTypeCatalog.other!).name)}
            {' · '}
            {file.displaySize}
            {'  '}
            {t('· Uploaded by')} {author ?? 'you'} {ago(file.createdAt, now)}
          </div>
        </div>
        <IconButton size="sm" aria-label={t('Close')} className="ml-auto" onClick={onClose}>
          <Icon name="x" size={16} />
        </IconButton>
      </div>
      <DialogBody>
        <div className="overflow-hidden rounded-lg border border-solid border-border [&_.file-preview]:aspect-[16/9]">
          <>
            {previewImage ? (
              <img
                ref={imageRef}
                alt={file.name}
                className="block max-h-[460px] w-full object-contain"
              />
            ) : (
              <FilePreviewArt name={file.name} type={file.fileType} />
            )}
          </>
        </div>
        {file.contentAvailable && content.isError && (
          <p role="alert">
            {t('Content could not be loaded.')}{' '}
            <Button
              onClick={() => {
                void content.refetch();
              }}
            >
              {t('Retry')}
            </Button>
          </p>
        )}
        {file.taskId && (
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <Icon name="link" size={13} />
            {t('Attached to')}{' '}
            <button
              className="font-medium text-accent source-hover:underline"
              onClick={() => {
                onClose();
                onTaskOpen(file.taskId!);
              }}
            >
              {taskTitle ?? 'Open task'}
            </button>
          </div>
        )}
        <p className="sr-only">
          {file.contentAvailable
            ? t('Content available')
            : t('Sample metadata preview; file content is unavailable.')}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button
          onClick={() =>
            onCopy(
              new URL(links.file(file.workspaceId, file.projectId, file.id), location.origin).href,
            )
          }
        >
          <Icon name="link" size={14} />
          {t('Copy link')}
        </Button>
        <span className="grow" />
        {file.contentAvailable && (
          <Button
            disabled={!content.data || content.isError || content.isFetching}
            onClick={() => {
              if (!content.data) return;
              const value = URL.createObjectURL(
                new Blob([content.data.bytes.slice().buffer], { type: content.data.contentType }),
              );
              const link = document.createElement('a');
              link.href = value;
              link.download = file.name;
              link.click();
              setTimeout(() => URL.revokeObjectURL(value), 1000);
            }}
          >
            {t('Download')}
          </Button>
        )}
        <Button variant="primary" onClick={onClose}>
          {t('Close')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
