import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { TaskQuerySchema } from '@studio/contracts/api';
import type { ActivityDto } from '@studio/contracts/api';
import { Alert, EmptyState, SegmentedControl, Select } from '@studio/ui';
import { useState } from 'react';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useDataRuntime } from '../../data/context';
import { links, validateRouteSearch } from '../../app/navigation';
import { queryKeys } from '../../data/query-keys';
import { loadTaskViewDataset } from '../tasks/loadTaskViewDataset';
import { useSurfaceMotion } from '../../app/services/surface-motion';
import { matchesActivity } from './format';
import { ActivityFeed } from './ActivityFeed';
export type ActivityFilter = 'all' | 'status' | 'comments' | 'projects';

export function WorkspaceActivity() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    data = useWorkspaceBootstrap().data!.data,
    { client, clock } = useDataRuntime(),
    { openTask } = useWorkspaceIntents(),
    projectsServices = useAppServices(),
    navigate = useNavigate(),
    location = useLocation();
  const [filter, setFilter] = useState<ActivityFilter>('all'),
    [actor, setActor] = useState('all');
  const scope = validateRouteSearch(location.search).activityProjectId ?? 'all',
    setScope = (id: string) => {
      projectsServices.surfaceOpened();
      void navigate({
        to: location.pathname,
        search: (previous) => {
          const next = { ...previous };
          if (id === 'all') delete next.activityProjectId;
          else next.activityProjectId = id;
          return next;
        },
        replace: true,
      });
    };
  const result = useQuery({
    queryKey: [...queryKeys.workspace(workspaceId), 'activity', 'workspace-feed', actor, scope],
    queryFn: async ({ signal }) => {
      const records = new Map<string, ActivityDto>(),
        cursors = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = (
          await client.execute(
            'listActivity',
            {
              workspaceId,
              query: {
                limit: 200,
                ...(actor !== 'all' ? { actorId: actor } : {}),
                ...(scope !== 'all' ? { projectId: scope } : {}),
                ...(cursor ? { cursor } : {}),
              },
            },
            { signal },
          )
        ).data;
        page.items.forEach((row) => records.set(row.id, row));
        cursor = page.nextCursor ?? undefined;
        if (cursor) {
          if (cursors.has(cursor)) throw Error('Activity cursor did not advance');
          cursors.add(cursor);
        }
        if (!cursor && records.size !== page.total) throw Error('Activity changed while loading');
      } while (cursor);
      const tasks = (
        await Promise.all(
          [false, true].map((archived) =>
            loadTaskViewDataset(
              client,
              workspaceId,
              TaskQuerySchema.parse({ archived, ...(scope !== 'all' ? { projectId: scope } : {}) }),
              signal,
            ),
          ),
        )
      ).flatMap((page) => page.items);
      return { records: [...records.values()], tasks };
    },
  });
  const { hostRef, onAnimationEnd } = useSurfaceMotion(
      location.pathname,
      `${filter}/${actor}/${scope}/${result.dataUpdatedAt}`,
      'page',
      projectsServices.surfaceRevision,
    ),
    records = result.data?.records.filter((row) => matchesActivity(row, filter)) ?? [];
  return (
    <div
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion
      data-workspace-activity
      data-activity-ready={result.data ? '' : undefined}
      className="mx-auto max-w-[820px] px-[var(--gutter)] pb-[72px] pt-7 source-tablet:pb-24 source-tablet:pt-5"
    >
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="m-0 text-balance text-2xl font-semibold leading-[1.2] tracking-[-.022em] source-mobile:text-xl">
            {t('Activity')}
          </h1>
          <p className="mb-0 mt-1 text-body text-secondary">
            {t("Everything that's changed across the workspace.")}
          </p>
        </div>
      </div>
      <div className="mb-[6px] flex flex-wrap items-center gap-2">
        <SegmentedControl
          className="[&>button]:[transition:background_var(--dur),color_var(--dur)]"
          value={filter}
          label={t('Activity type')}
          items={[
            { value: 'all', label: t('All') },
            { value: 'status', label: t('Status changes') },
            { value: 'comments', label: t('Comments') },
            { value: 'projects', label: t('Projects') },
          ]}
          onValueChange={(value) => {
            projectsServices.surfaceOpened();
            setFilter(value as ActivityFilter);
          }}
        />
        <Select
          className="h-[26px]! w-auto! text-xs! [transition-timing-function:ease]"
          label={t('Filter by person')}
          value={actor}
          options={[
            { value: 'all', label: t('Everyone') },
            ...data.members.map((member) => ({ value: member.id, label: member.name })),
          ]}
          onValueChange={(value) => {
            projectsServices.surfaceOpened();
            setActor(value);
          }}
        />
        {scope !== 'all' && (
          <Select
            className="h-[26px]! w-auto! text-xs! [transition-timing-function:ease]"
            label={t('Activity project')}
            value={scope}
            options={[
              { value: 'all', label: t('All projects') },
              ...data.projects
                .filter((row) => row.access === 'allowed')
                .map((row) => ({ value: row.project.id, label: row.project.name })),
            ]}
            onValueChange={setScope}
          />
        )}
      </div>
      {result.error ? (
        <Alert tone="danger">{result.error.message}</Alert>
      ) : !result.data ? (
        <div role="status">{t('Loading activity…')}</div>
      ) : records.length ? (
        <ActivityFeed
          records={records}
          data={data}
          tasks={result.data.tasks}
          now={clock.now()}
          today={clock.today()}
          grouped
          lined
          showProject
          onTaskOpen={(id) => {
            projectsServices.surfaceOpened();
            openTask(id);
          }}
          onProjectOpen={(id) => {
            void navigate({ to: links.project(workspaceId, id, 'overview') });
          }}
          onActorOpen={(id) => {
            void navigate({ to: `/w/${workspaceId}/members/${id}` });
          }}
        />
      ) : (
        <EmptyState
          icon="activity"
          heading={t('No activity yet')}
          description={t('Changes to tasks and projects will appear here.')}
        />
      )}
    </div>
  );
}
