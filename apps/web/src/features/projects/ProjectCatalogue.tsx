import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, EmptyState, Icon, Input, SegmentedControl, Select } from '@studio/ui';
import type { ProjectDto } from '@studio/contracts/api';
import { projectStatuses } from '@studio/contracts/api';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useDataRuntime } from '../../data/context';
import { queryKeys } from '../../data/query-keys';
import { links, validateRouteSearch } from '../../app/navigation';
import { useSurfaceMotion } from '../../app/services/surface-motion';
import { useProjectIntents } from './project-intents';
import { loadProjectCatalogue } from './catalogue';
import { ProjectCard, ProjectRow, ProjectTable } from './ProjectComponents';
export function ProjectCatalogue() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    data = useWorkspaceBootstrap().data!.data,
    { client, clock } = useDataRuntime(),
    intents = useProjectIntents(),
    intentsServices = useAppServices(),
    route = useLocation(),
    navigate = useNavigate(),
    search = validateRouteSearch(route.search),
    mode = search.mode === 'list' || search.mode === 'table' ? search.mode : 'grid',
    query = {
      q: search.q ?? '',
      sort: search.projectSort ?? 'recent',
      ...(search.projectStatus ? { status: search.projectStatus } : {}),
    };
  const catalogue = useQuery({
    queryKey: [...queryKeys.workspace(workspaceId), 'projects', 'complete', query],
    queryFn: ({ signal }) => loadProjectCatalogue(client, workspaceId, query, signal),
  });
  const change = (patch: { [K in keyof typeof search]?: (typeof search)[K] | undefined }) => {
    void navigate({
      to: route.pathname,
      search: (previous) => validateRouteSearch({ ...previous, ...patch }),
      replace: true,
    });
  };
  const open = (id: string) => {
    void navigate({ to: links.project(workspaceId, id, data.preferences.defaultTab) });
  };
  const { hostRef, onAnimationEnd } = useSurfaceMotion(
    route.pathname,
    `${route.searchStr}/${JSON.stringify(catalogue.data)}`,
    'page',
    `${route.searchStr}/${intentsServices.surfaceRevision}`,
  );
  const rows = catalogue.data?.items ?? [];
  const common = { data, now: clock.now(), onOpen: open, onMenu: intents.projectMenu };
  return (
    <div
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion
      className="px-[var(--gutter)] pb-[72px] pt-7 max-[900px]:pb-24 max-[900px]:pt-5"
      data-project-catalogue
      data-project-coverage={catalogue.data?.coverage ?? 'pending'}
    >
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold leading-[1.2] tracking-[-.022em] max-[640px]:text-xl">
            {t('Projects')}
          </h1>
          <p className="mb-0 mt-1 text-body text-secondary">
            {data.projects.filter((item) => item.project.status !== 'complete').length}
            {'  '}
            {t('active ·')}{' '}
            {data.projects.filter((item) => item.project.status === 'complete').length}
            {'  '}
            {t('completed')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-[6px] max-[640px]:ml-0 max-[640px]:w-full">
          <Button variant="primary" onClick={intents.newProject}>
            <Icon name="plus" size={14} />
            {t('New project')}
          </Button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="relative flex items-center">
          <Icon
            name="search"
            size={13}
            className="pointer-events-none absolute left-[9px] text-faint"
          />
          <Input
            size="sm"
            className="w-[200px]! pl-[30px]!"
            aria-label={t('Search projects')}
            placeholder={t('Search projects')}
            value={query.q}
            onChange={(event) => change({ q: event.target.value })}
          />
        </span>
        <Select
          label={t('Filter by status')}
          className="h-[26px]! w-auto! text-xs!"
          value={search.projectStatus ?? 'all'}
          options={[
            { value: 'all', label: t('All statuses') },
            ...projectStatuses.map((item) => ({ value: item.id, label: t(item.name) })),
          ]}
          onValueChange={(value) =>
            change({ projectStatus: value === 'all' ? undefined : (value as ProjectDto['status']) })
          }
        />
        <Select
          label={t('Sort')}
          className="h-[26px]! w-auto! text-xs!"
          value={query.sort}
          options={[
            { value: 'recent', label: t('Sort: Recently active') },
            { value: 'name', label: t('Sort: Name') },
            { value: 'due', label: t('Sort: Due date') },
            { value: 'progress', label: t('Sort: Progress') },
          ]}
          onValueChange={(value) => change({ projectSort: value as typeof query.sort })}
        />
        <span className="flex-1" />
        <SegmentedControl
          label={t('Layout')}
          value={mode}
          onValueChange={(value) => change({ mode: value as 'grid' | 'list' | 'table' })}
          items={[
            {
              value: 'grid',
              ariaLabel: t('Grid'),
              icon: <Icon name="layout-grid" size={13} />,
              label: <span className="project-hide-mobile">{t('Grid')}</span>,
            },
            {
              value: 'list',
              ariaLabel: t('List'),
              icon: <Icon name="list" size={13} />,
              label: <span className="project-hide-mobile">{t('List')}</span>,
            },
            {
              value: 'table',
              ariaLabel: t('Table'),
              icon: <Icon name="table-2" size={13} />,
              label: <span className="project-hide-mobile">{t('Table')}</span>,
            },
          ]}
        />
      </div>
      {catalogue.error ? (
        <Alert tone="danger">{catalogue.error.message}</Alert>
      ) : catalogue.isPending ? (
        <div role="status">{t('Loading projects…')}</div>
      ) : !rows.length ? (
        <div className="rounded-lg border border-solid border-border bg-surface">
          <EmptyState
            icon={data.projects.length ? 'search-x' : 'folder-kanban'}
            heading={data.projects.length ? t('No results found') : t('No projects yet')}
            description={
              data.projects.length
                ? t('No projects match your search or filters. Try a different term.')
                : t('Create your first project to start organizing your work.')
            }
            action={
              <Button
                size="sm"
                variant={data.projects.length ? 'secondary' : 'primary'}
                onClick={
                  data.projects.length
                    ? () => change({ q: '', projectStatus: undefined })
                    : intents.newProject
                }
              >
                {!data.projects.length && <Icon name="plus" size={14} />}
                {data.projects.length ? t('Clear filters') : t('Create project')}
              </Button>
            }
          />
        </div>
      ) : mode === 'grid' ? (
        <div className="project-grid">
          {rows.map((item) => (
            <ProjectCard key={item.project.id} item={item} {...common} />
          ))}
        </div>
      ) : mode === 'list' ? (
        <div className="overflow-hidden rounded-lg border border-solid border-border bg-surface">
          {rows.map((item) => (
            <ProjectRow key={item.project.id} item={item} {...common} />
          ))}
        </div>
      ) : (
        <ProjectTable items={rows} {...common} />
      )}
    </div>
  );
}
