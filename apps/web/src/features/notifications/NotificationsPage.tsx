import { translateErrorMessage } from '../../i18n/error-message';
import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { Fragment, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Panel,
  SegmentedControl,
} from '@studio/ui';
import type { NotificationDto } from '@studio/contracts/api';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useDataRuntime } from '../../data/context';
import { links } from '../../app/navigation';
import { useSurfaceMotion } from '../../app/services/surface-motion';
import { activityDay } from '../activity/format';
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
import './notifications.css';

export function NotificationsPage() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    data = useWorkspaceBootstrap().data!.data,
    model = useNotifications(workspaceId),
    commands = useNotificationCommands(workspaceId),
    { clock } = useDataRuntime(),
    intents = useAppServices(),
    { openTask } = useWorkspaceIntents(),
    navigate = useNavigate(),
    location = useLocation(),
    [filter, setFilter] = useState('all');
  const unreadCount = model.query.data?.unreadCount ?? 0,
    records = model.records.filter((row) => filter === 'all' || !row.readAt),
    groups = new Map<string, NotificationDto[]>();
  records.forEach((row) => {
    const day = activityDay(row.createdAt, clock.today());
    groups.set(day, [...(groups.get(day) ?? []), row]);
  });
  const { hostRef, onAnimationEnd } = useSurfaceMotion(
    location.pathname,
    `${filter}/${model.query.dataUpdatedAt}`,
    'page',
    intents.surfaceRevision,
  );
  async function open(notification: NotificationDto) {
    intents.surfaceOpened();
    if (!notification.readAt && !(await commands.read(notification, true))) return;
    if (notification.taskId) openTask(notification.taskId);
    else if (notification.projectId)
      void navigate({ to: links.project(workspaceId, notification.projectId, 'overview') });
  }
  async function markAll() {
    intents.surfaceOpened();
    if ((await commands.readAll()) && unreadCount) intents.notice(t("You're all caught up."));
  }
  return (
    <div
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion
      data-notifications-page
      data-notifications-ready={!model.pending && !model.error ? '' : undefined}
      className="mx-auto max-w-[820px] px-[var(--gutter)] pb-[72px] pt-7 source-tablet:pb-24 source-tablet:pt-5"
    >
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="m-0 flex items-center gap-[10px] text-2xl font-semibold leading-[1.2] tracking-[-.022em] source-mobile:text-xl">
            {t('Notifications')}{' '}
            {unreadCount > 0 && (
              <Badge tone="accent">
                {unreadCount}
                {'  '}
                {t('unread')}
              </Badge>
            )}
          </h1>
          <p className="mb-0 mt-1 text-body text-secondary">
            {t('Updates on tasks and projects you follow.')}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-[6px] source-mobile:ml-0 source-mobile:w-full">
          <SegmentedControl
            label={t('Notification filter')}
            value={filter}
            items={[
              { value: 'all', label: t('All') },
              { value: 'unread', label: t('Unread') },
            ]}
            onValueChange={(value) => {
              intents.surfaceOpened();
              setFilter(value);
            }}
          />
          <Button
            variant="secondary"
            disabled={!unreadCount || commands.pending}
            onClick={() => {
              void markAll();
            }}
          >
            <Icon name="check-check" size={14} />
            {t('Mark all as read')}
          </Button>
          <IconButton
            aria-label={t('Notification preferences')}
            title={t('Notification preferences')}
            onClick={() => {
              void navigate({ to: `/w/${workspaceId}/settings/notif-email` });
            }}
          >
            <Icon name="settings-2" size={16} />
          </IconButton>
        </div>
      </div>
      {commands.error && <Alert tone="danger">{commands.error}</Alert>}
      {model.error ? (
        <Alert tone="danger">
          {translateErrorMessage(model.error.message)}{' '}
          <Button size="sm" onClick={model.retry}>
            {t('Retry')}
          </Button>
        </Alert>
      ) : model.pending ? (
        <div role="status">{t('Loading notifications…')}</div>
      ) : records.length ? (
        [...groups].map(([day, list]) => (
          <Fragment key={day}>
            <div className="pb-1 pt-[14px] text-xs font-semibold uppercase tracking-[.06em] text-muted">
              {t(day)}
            </div>
            <Panel className="overflow-hidden">
              {list.map((notification) => {
                const task = model.tasks.find((row) => row.id === notification.taskId),
                  props = { notification, data, task },
                  project = notificationProject(props);
                return (
                  <div
                    key={notification.id}
                    data-notification-id={notification.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!commands.pending) void open(notification);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.target === event.currentTarget &&
                        ['Enter', ' '].includes(event.key)
                      ) {
                        event.preventDefault();
                        if (!commands.pending) void open(notification);
                      }
                    }}
                    className={`notification-row flex cursor-pointer items-start gap-3 px-[14px] py-[11px] source-hover:bg-surface-2 ${!notification.readAt ? 'bg-[color-mix(in_srgb,var(--accent)_3.5%,transparent)]' : ''}`}
                  >
                    <NotificationAvatar {...props} />
                    <div className="min-w-0 flex-1 text-[13px]">
                      <div>
                        <NotificationContent {...props} />
                      </div>
                      <div className="mt-[2px] truncate text-sm text-secondary">
                        <NotificationSnippet {...props} />
                      </div>
                      <div className="mt-1 text-[11.5px] text-muted">
                        {project ? `${project.name} · ` : ''}
                        {ago(notification.createdAt, clock.now())}
                      </div>
                    </div>
                    {!notification.readAt && (
                      <span
                        aria-label={t('Unread')}
                        className="mt-2 size-[7px] rounded-full bg-accent"
                      />
                    )}
                    <ReadToggle
                      notification={notification}
                      layout="notifications"
                      pending={commands.pending}
                      onToggle={() => {
                        intents.surfaceOpened();
                        void commands.read(notification, !notification.readAt);
                      }}
                    />
                  </div>
                );
              })}
            </Panel>
          </Fragment>
        ))
      ) : (
        <Panel>
          <EmptyState
            icon="bell-off"
            heading={t("You're all caught up.")}
            description={t("No unread notifications. We'll let you know when something needs you.")}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  intents.surfaceOpened();
                  setFilter('all');
                }}
              >
                {t('Show all')}
              </Button>
            }
          />
        </Panel>
      )}
    </div>
  );
}
