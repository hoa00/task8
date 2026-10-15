import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
} from '@tanstack/react-router';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  Icon,
  Input,
  Menu,
  MenuItem,
  Select,
} from '@studio/ui';
import { EntityIdSchema } from '@studio/contracts/api';
import type { SavedViewDto } from '@studio/contracts/api';
import type { TaskViewState } from '../tasks/task-view.ts';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { ProjectContext } from '../../app/shell/project-context';
import { AccessDeniedBoundary, NotFoundBoundary } from '../../app/shell/Boundaries';
import { useStudioQuery } from '../../data/queries';
import { useProjectCommands } from './useProjectCommands';
import { decodeCurrentTaskView } from '../tasks/current-view';
import { links } from '../../app/navigation';
import { useSurfaceMotion } from '../../app/services/surface-motion';
import { ProjectHeader } from './ProjectHeader';
import { projectTabItems } from './tabs';
import {
  ProjectViewContext,
  projectViewKey,
  projectViewStorageKey,
  readProjectView,
} from './project-view';
export function ProjectLayout() {
  useTranslation();
  const data = useWorkspaceBootstrap().data!.data,
    params = useParams({ strict: false }),
    projectId = EntityIdSchema.parse(params.projectId),
    item = data.projects.find((item) => item.project.id === projectId);
  return (
    <ProjectContext value={projectId}>
      {!item ? (
        <NotFoundBoundary />
      ) : item.access === 'restricted' ? (
        <AccessDeniedBoundary projectName={item.project.name} ownerName={item.project.lead.name} />
      ) : (
        <AllowedProjectLayout key={projectId} projectId={projectId} />
      )}
    </ProjectContext>
  );
}
export interface AllowedProjectLayoutProps {
  projectId: string;
}
function AllowedProjectLayout({ projectId }: AllowedProjectLayoutProps) {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    bootstrap = useWorkspaceBootstrap(),
    data = bootstrap.data!.data,
    item = data.projects.find((item) => item.project.id === projectId)!,
    project = item.access === 'allowed' ? item.project : null,
    route = useLocation(),
    router = useRouter(),
    navigate = useNavigate(),
    params = useParams({ strict: false }),
    savedViews = useStudioQuery('listSavedViews', { workspaceId, projectId }),
    commands = useProjectCommands(workspaceId),
    intents = useAppServices(),
    [personal, setPersonal] = useState<Record<string, TaskViewState>>({}),
    [dialog, setDialog] = useState<'save' | 'rename' | null>(null),
    [name, setName] = useState(''),
    [layout, setLayout] = useState<SavedViewDto['type']>('list'),
    [menu, setMenu] = useState<{ view: SavedViewDto; anchor: HTMLElement } | null>(null),
    rename = useRef<SavedViewDto | null>(null),
    tabsRef = useRef<HTMLElement>(null),
    nameRef = useRef<HTMLInputElement>(null),
    savedFormId = useId(),
    submitLock = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const saved = savedViews.data?.data.find((view) => view.id === params.savedViewId),
    key = projectViewKey(projectId, saved?.id),
    hasUrlView = new URLSearchParams(route.searchStr).has('view'),
    view = hasUrlView
      ? decodeCurrentTaskView(route.searchStr)
      : (personal[key] ?? readProjectView(workspaceId, data.currentMember.id, projectId, saved));
  const change = (next: TaskViewState) => {
    setPersonal((current) => ({ ...current, [key]: next }));
    try {
      localStorage.setItem(
        projectViewStorageKey(workspaceId, data.currentMember.id, key),
        JSON.stringify(next),
      );
    } catch {
      /* URL preserves current configuration if storage is unavailable. */
    }
    void navigate({
      to: route.pathname,
      search: (previous) => ({ ...previous, view: JSON.stringify(next) }),
      replace: true,
    });
  };
  const tab = params.savedViewId ? `sv:${params.savedViewId}` : (params.view ?? 'board');
  const fixedView =
    personal[projectViewKey(projectId)] ??
    readProjectView(workspaceId, data.currentMember.id, projectId);
  const { hostRef, onAnimationEnd } = useSurfaceMotion(
    route.pathname,
    `${JSON.stringify(item)}/${JSON.stringify(savedViews.data?.data)}/${route.searchStr}`,
    'project',
    `${dialog ?? ''}/${!!menu}/${intents.surfaceRevision}`,
  );
  useLayoutEffect(() => {
    if (tabsRef.current) tabsRef.current.scrollLeft = 0;
  }, [route.pathname, dialog]);
  useEffect(
    () =>
      router.subscribe('onRendered', (event) => {
        if (event.fromLocation?.pathname !== event.toLocation.pathname && tabsRef.current)
          tabsRef.current.scrollLeft = 0;
      }),
    [router],
  );
  const fixedSearch = { view: JSON.stringify(params.savedViewId ? fixedView : view) };
  async function submitSavedView() {
    if (submitLock.current) return;
    submitLock.current = true;
    try {
      const result =
        dialog === 'save'
          ? await commands.run('createSavedView', {
              workspaceId,
              projectId,
              body: {
                name: name.trim() || t('Untitled view'),
                type: layout,
                filters: view.query.filters,
              },
            })
          : await commands.run('updateSavedView', {
              workspaceId,
              viewId: rename.current!.id,
              body: {
                name: name.trim(),
                expectedVersion:
                  savedViews.data?.data.find((row) => row.id === rename.current!.id)?.version ??
                  rename.current!.version,
              },
            });
      if (result && active.current) {
        setDialog(null);
        if (dialog === 'save') {
          intents.notice(`Saved view “${result.data.name}”`);
          void navigate({
            to: links.savedView(workspaceId, projectId, result.data.id),
            search: {},
          });
        } else intents.notice('View renamed');
      }
    } finally {
      submitLock.current = false;
    }
  }
  if (!project) return <AccessDeniedBoundary />;
  return (
    <ProjectViewContext
      value={{
        projectId: EntityIdSchema.parse(projectId),
        ...(saved ? { savedView: saved } : {}),
        view,
        onViewChange: change,
      }}
    >
      <div
        ref={hostRef}
        onAnimationEnd={onAnimationEnd}
        className="flex h-full max-w-none flex-col p-0"
        data-project-host={projectId}
      >
        <ProjectHeader project={project} data={data} files={tab === 'files'}>
          <nav
            ref={tabsRef}
            className="project-header-tabs flex gap-[2px] overflow-x-auto border-0 border-b border-solid border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t('Project views')}
          >
            {projectTabItems.map(([id, label, icon]) => (
              <Link
                key={id}
                to={links.project(
                  workspaceId,
                  projectId,
                  id as Parameters<typeof links.project>[2],
                )}
                search={fixedSearch}
                aria-current={tab === id ? 'page' : undefined}
                aria-selected={tab === id}
                className="ui-tab relative inline-flex h-9 items-center gap-[6px] whitespace-nowrap px-[10px] text-sm font-medium text-secondary transition-colors aria-selected:text-foreground source-hover:text-foreground"
              >
                <Icon name={icon} size={14} />
                {t(label)}
              </Link>
            ))}
            {savedViews.data?.data.map((savedView) => (
              <Link
                key={savedView.id}
                to={links.savedView(workspaceId, projectId, savedView.id)}
                search={{}}
                aria-current={tab === `sv:${savedView.id}` ? 'page' : undefined}
                aria-selected={tab === `sv:${savedView.id}`}
                className="ui-tab relative inline-flex h-9 items-center gap-[6px] whitespace-nowrap px-[10px] text-sm font-medium text-secondary transition-colors aria-selected:text-foreground source-hover:text-foreground"
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ view: savedView, anchor: event.currentTarget });
                }}
              >
                <Icon name="list-filter" size={14} />
                {savedView.name}
              </Link>
            ))}
            <button
              aria-label={t('Save view')}
              className="inline-flex h-9 items-center gap-[6px] whitespace-nowrap px-[10px] text-sm font-medium text-secondary source-hover:text-foreground"
              onClick={() => {
                commands.clearError();
                setName('');
                setLayout('list');
                setDialog('save');
              }}
            >
              <Icon name="plus" size={14} />
            </button>
          </nav>
        </ProjectHeader>
        <div className="project-body flex min-h-0 flex-1 flex-col" data-project-body>
          {savedViews.error ? (
            <Alert tone="danger">{savedViews.error.message}</Alert>
          ) : params.savedViewId && savedViews.data && !saved ? (
            <NotFoundBoundary />
          ) : params.savedViewId && !savedViews.data ? (
            <div role="status" className="p-6">
              {t('Loading view…')}
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
      <Menu
        open={!!menu}
        anchor={{ current: menu?.anchor ?? null }}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
        label={t('Saved view options')}
      >
        <MenuItem
          icon={<Icon name="pencil" size={15} />}
          onSelect={() => {
            rename.current = menu!.view;
            setName(menu!.view.name);
            setMenu(null);
            setDialog('rename');
            commands.clearError();
          }}
        >
          {t('Rename view')}
        </MenuItem>
        <MenuItem
          danger
          icon={<Icon name="trash-2" size={15} />}
          onSelect={async () => {
            const definition = menu!.view;
            setMenu(null);
            const result = await commands.run('deleteSavedView', {
              workspaceId,
              viewId: definition.id,
              body: { expectedVersion: definition.version },
            });
            if (result && active.current) {
              intents.notice(t('Deleted view “{{name}}”', { name: definition.name }));
              if (params.savedViewId === definition.id)
                void navigate({
                  to: links.project(workspaceId, projectId, 'list'),
                  search: { view: JSON.stringify(fixedView) },
                });
            }
          }}
        >
          {t('Delete view')}
        </MenuItem>
      </Menu>
      {dialog && (
        <Dialog
          entryRevision={`${commands.error ?? ''}`}
          open
          size="sm"
          initialFocus={nameRef}
          data-project-saved-dialog
          aria-labelledby="saved-view-title"
          onOpenChange={(open) => {
            if (!open && !commands.pending) setDialog(null);
          }}
        >
          <DialogHeader
            title={dialog === 'save' ? t('Save view') : t('Rename view')}
            titleId="saved-view-title"
            description={
              dialog === 'save' ? t('Save the current filters as a tab on this project.') : ''
            }
            onClose={() => {
              if (!commands.pending) setDialog(null);
            }}
          />
          <DialogBody
            as="form"
            id={savedFormId}
            onSubmit={(event) => {
              event.preventDefault();
              void submitSavedView();
            }}
          >
            <Field label={t('View name')} controlId="saved-view-name">
              <Input
                ref={nameRef}
                id="saved-view-name"
                value={name}
                disabled={commands.pending}
                placeholder={t('e.g. Design review queue')}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            {dialog === 'save' && (
              <>
                <Field label={t('Layout')}>
                  <Select
                    label={t('Layout')}
                    value={layout}
                    disabled={commands.pending}
                    options={['list', 'board', 'table'].map((value) => ({
                      value,
                      label: t(value[0]!.toUpperCase() + value.slice(1)),
                    }))}
                    onValueChange={(value) => setLayout(value as SavedViewDto['type'])}
                  />
                </Field>
                {view.query.filters.length ? (
                  <div className="text-xs text-muted">
                    {view.query.filters.length}
                    {'  '}
                    {t('filter')}
                    {view.query.filters.length > 1 ? t('s') : ''}
                    {'  '}
                    {t('will be saved with this view.')}
                  </div>
                ) : (
                  <Alert tone="info">
                    <Icon name="info" size={14} className="mt-px" />
                    <span>
                      {t(
                        'No filters are active — the view will show all tasks. You can add filters after saving.',
                      )}
                    </span>
                  </Alert>
                )}
              </>
            )}
            {commands.error && <Alert tone="danger">{commands.error}</Alert>}
          </DialogBody>
          <DialogFooter>
            <span className="flex-1" />
            <Button variant="secondary" disabled={commands.pending} onClick={() => setDialog(null)}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" loading={commands.pending} type="submit" form={savedFormId}>
              {dialog === 'save' ? t('Save view') : t('Save changes')}
            </Button>
          </DialogFooter>
        </Dialog>
      )}
      {!dialog && commands.error && <Alert tone="danger">{commands.error}</Alert>}
    </ProjectViewContext>
  );
}
