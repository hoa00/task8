import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Alert, Button, ColorDot, EmptyState, Icon, IconButton, Tabs, Toggle } from '@studio/ui';
import type { NotificationDto } from '@studio/contracts/api';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useDataRuntime } from '../../data/context';
import { links } from '../../app/navigation';
import { useProjectMotion } from '../projects/project-motion';
import { useProjectIntents } from '../projects/project-intents';
import { ago } from '../tasks/date-display';
import {
  NotificationAvatar,
  NotificationContent,
  NotificationSnippet,
  ReadToggle,
} from './NotificationContent';
import { notificationProject } from './presentation';
import { useNotifications } from './queries';
import { useNotificationCommands } from './useNotificationCommands';
import { InboxPreview } from './InboxPreview';
import { useTaskCommentDraftStore } from '../comments/draft-context';
import './notifications.css';

function subscribeMobile(callback: () => void) {
  const media = matchMedia('(max-width:900px)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const categories = [
  { value: 'all', label: t('All') },
  { value: 'mention', label: t('Mentions') },
  { value: 'assign', label: t('Assignments') },
  { value: 'comment', label: t('Comments') },
  { value: 'update', label: t('Updates') },
] as const;
export function InboxPage() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    data = useWorkspaceBootstrap().data!.data,
    model = useNotifications(workspaceId),
    commands = useNotificationCommands(workspaceId),
    { clock } = useDataRuntime(),
    intents = useProjectIntents(),
    { openTask } = useWorkspaceIntents(),
    navigate = useNavigate(),
    location = useLocation();
  const [category, setCategory] = useState('all'),
    [unread, setUnread] = useState(false),
    [selectedId, setSelectedId] = useState<string | null>(null),
    opener = useRef<HTMLElement | null>(null),
    rail = useRef<HTMLDivElement>(null),
    preview = useRef<HTMLDivElement>(null),
    tabs = useRef<HTMLDivElement>(null);
  const commentDrafts = useTaskCommentDraftStore();
  if (!commentDrafts) throw new Error('Inbox drafts require the workspace comment draft owner');
  const { drafts, changeDraft } = commentDrafts;
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => matchMedia('(max-width:900px)').matches,
    () => false,
  );
  const selected = model.records.find((row) => row.id === selectedId),
    records = model.records.filter(
      (row) => (category === 'all' || row.type === category) && (!unread || !row.readAt),
    );
  const selectedDraftRevision = selected?.taskId ? (drafts[selected.taskId]?.revision ?? 0) : 0;
  useLayoutEffect(() => {
    if (tabs.current) tabs.current.scrollLeft = 0;
  }, [category, unread, model.query.dataUpdatedAt]);
  const { hostRef, onAnimationEnd } = useProjectMotion(
    location.pathname,
    `${category}/${unread}/${selectedId}/${model.query.dataUpdatedAt}`,
    'page',
    intents.overlayState,
  );
  const consume = () => intents.projectSurfaceOpened();
  function select(notification: NotificationDto, element: HTMLElement) {
    consume();
    opener.current = element;
    setSelectedId(notification.id);
    if (!notification.readAt) void commands.read(notification, true);
    if (mobile)
      requestAnimationFrame(() => preview.current?.querySelector<HTMLElement>('button')?.focus());
  }
  function close() {
    consume();
    setSelectedId(null);
    requestAnimationFrame(() => {
      const element =
        opener.current?.isConnected && opener.current.getClientRects().length
          ? opener.current
          : rail.current;
      element?.focus({ preventScroll: true });
    });
  }
  async function markAll() {
    consume();
    const hadUnread = model.records.some((row) => !row.readAt);
    if ((await commands.readAll()) && hadUnread) intents.notice("You're all caught up.");
  }
  return (
    <div
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion
      data-inbox-page
      data-notifications-ready={!model.pending && !model.error ? '' : undefined}
      className="flex h-full max-w-none flex-col p-0"
    >
      <div className="inbox-grid grid min-h-0 flex-1 grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div
          className="flex min-h-0 flex-col border-0 border-r border-solid border-border"
          inert={(mobile && !!selected) || undefined}
        >
          <div className="flex items-center gap-2 px-[var(--gutter)] pt-[18px]">
            <h1 className="m-0 text-xl font-semibold tracking-[-.015em]">{t('Inbox')}</h1>
            <span className="grow" />
            <label className="flex cursor-pointer items-center gap-[6px] text-xs text-secondary">
              <Toggle
                aria-label={t('Unread')}
                checked={unread}
                onCheckedChange={(value) => {
                  consume();
                  setUnread(value);
                }}
              />
              {t('Unread')}
            </label>
            <IconButton
              size="sm"
              aria-label={t('Mark all as read')}
              title={t('Mark all as read')}
              disabled={commands.pending}
              onClick={() => {
                void markAll();
              }}
            >
              <Icon name="check-check" size={15} />
            </IconButton>
          </div>
          <Tabs
            ref={tabs}
            className="inbox-tabs mt-2 gap-4! px-[var(--gutter)]"
            label={t('Inbox categories')}
            value={category}
            onValueChange={(value) => {
              consume();
              setCategory(value);
            }}
            items={categories.map((row) => ({
              ...row,
              ...(model.records.filter(
                (notification) =>
                  (row.value === 'all' || notification.type === row.value) && !notification.readAt,
              ).length
                ? {
                    count: model.records.filter(
                      (notification) =>
                        (row.value === 'all' || notification.type === row.value) &&
                        !notification.readAt,
                    ).length,
                  }
                : {}),
            }))}
          />
          {commands.error && <Alert tone="danger">{commands.error}</Alert>}
          <div
            ref={rail}
            tabIndex={-1}
            className="inbox-list min-h-0 flex-1 overflow-y-auto outline-none"
          >
            {model.error ? (
              <Alert tone="danger">
                {model.error.message}{' '}
                <Button size="sm" onClick={model.retry}>
                  {t('Retry')}
                </Button>
              </Alert>
            ) : model.pending ? (
              <div role="status" className="p-6 text-secondary">
                {t('Loading notifications…')}
              </div>
            ) : records.length ? (
              records.map((notification) => {
                const task = model.tasks.find((row) => row.id === notification.taskId),
                  props = { notification, data, task },
                  project = notificationProject(props),
                  typeIcon = {
                    mention: 'at-sign',
                    assign: 'user-plus',
                    comment: 'message-square',
                    update: 'refresh-cw',
                  } as const;
                return (
                  <div
                    key={notification.id}
                    data-notification-id={notification.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${notification.text} ${task?.title ?? ''}`.trim()}
                    onClick={(event) => select(notification, event.currentTarget)}
                    onKeyDown={(event) => {
                      if (
                        event.target === event.currentTarget &&
                        ['Enter', ' '].includes(event.key)
                      ) {
                        event.preventDefault();
                        select(notification, event.currentTarget);
                      }
                    }}
                    className={`relative flex cursor-pointer items-start gap-[10px] border-0 border-b border-solid border-divider px-[var(--gutter)] py-3 ${notification.id === selectedId ? 'bg-surface-2' : ''}`}
                  >
                    {!notification.readAt && (
                      <span
                        aria-label={t('Unread')}
                        className="absolute left-[6px] top-[22px] size-[6px] rounded-full bg-accent"
                      />
                    )}
                    <NotificationAvatar {...props} />
                    <div className="min-w-0 flex-1 text-[13px] leading-[1.45]">
                      <div>
                        <NotificationContent {...props} />
                      </div>
                      <div className="mt-[2px] truncate text-sm text-secondary">
                        <NotificationSnippet {...props} />
                      </div>
                      <div className="mt-[5px] flex items-center gap-[6px] text-[11.5px] text-muted">
                        <Icon name={typeIcon[notification.type]} size={11} />
                        {project && (
                          <>
                            <ColorDot color={project.color} />
                            {project.name}
                          </>
                        )}
                        <span>{'·'}</span>
                        <span>{ago(notification.createdAt, clock.now())}</span>
                      </div>
                    </div>
                    <ReadToggle
                      notification={notification}
                      layout="inbox"
                      pending={commands.pending}
                      onToggle={() => {
                        consume();
                        void commands.read(notification, !notification.readAt);
                      }}
                    />
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon="inbox"
                heading={t("You're all caught up.")}
                description={
                  unread
                    ? t('No unread notifications in this category.')
                    : t('New mentions, assignments, and comments will show up here.')
                }
                size="sm"
              />
            )}
          </div>
        </div>
        <div
          ref={preview}
          data-inbox-preview
          data-selected={selected ? '' : undefined}
          className="inbox-preview flex min-h-0 flex-col overflow-y-auto"
        >
          {selected ? (
            <InboxPreview
              key={selected.taskId ?? selected.id}
              notification={selected}
              task={model.tasks.find((row) => row.id === selected.taskId)}
              data={data}
              draft={selected.taskId ? (drafts[selected.taskId]?.value ?? '') : ''}
              onDraftChange={(value) => {
                if (selected.taskId) changeDraft(selected.taskId, value);
              }}
              onDraftPosted={() => {
                if (selected.taskId) changeDraft(selected.taskId, '', selectedDraftRevision);
              }}
              onClose={close}
              onTaskOpen={(id) => {
                consume();
                openTask(id);
              }}
              onProjectOpen={(id) => {
                void navigate({ to: links.project(workspaceId, id, 'overview') });
              }}
            />
          ) : (
            <div className="grid min-h-full place-items-center px-5 py-10">
              <div className="flex max-w-[420px] flex-col items-center gap-2 text-center">
                <EmptyState
                  icon="mail-open"
                  heading={t('Select a notification')}
                  description={t('Read the conversation and reply without leaving your inbox.')}
                  className="p-0! [&_p]:mb-3!"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
