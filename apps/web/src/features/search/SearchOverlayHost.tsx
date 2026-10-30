import { submitIdentityLogout } from '../../app/auth-navigation';
import { useAppServices } from '../../app/services/app-services';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Button, Dialog, DialogBody, DialogFooter } from '@studio/ui';
import type { BootstrapDto, SearchResultDto } from '@studio/contracts/api';
import { links, validateRouteSearch } from '../../app/navigation';
import { useWorkspaceIntents } from '../../app/shell/transient-context';
import { useDataRuntime } from '../../data/context';
import { useStudioQuery } from '../../data/queries';
import { useSettingsCommands } from '../settings/useSettingsCommands';
import { useTheme } from '../../theme/theme-context';
import { useProjectIntents } from '../projects/project-intents';
import { useFileIntents } from '../files/file-intents';
import { normalizeTaskView } from '../tasks/task-view.ts';
import { SearchIntentContext } from './search-intents';
import { recentSearchKey, readRecentSearches } from './recent-searches';
import { usePeopleIntents } from '../people/people-intents';
import { commandDefinitions } from './commands';
import type { CommandId } from './commands';
import { useGlobalShortcuts } from './global-shortcuts';
import { CommandPalette } from './CommandPalette';
import type { PaletteMode, CommandPaletteProps } from './CommandPalette';
import { ShortcutsDialog } from './ShortcutsDialog';
export interface SearchOverlayHostProps {
  data: BootstrapDto;
  children: ReactNode;
  toggleSidebar: () => void;
  onOpenOverlay: () => void;
}
export function SearchOverlayHost({
  data,
  children,
  toggleSidebar,
  onOpenOverlay,
}: SearchOverlayHostProps) {
  useTranslation();
  const settings = useSettingsCommands(),
    { client, authDemo, auth } = useDataRuntime(),
    files = useFileIntents(),
    people = usePeopleIntents(),
    projects = useProjectIntents(),
    projectsServices = useAppServices(),
    tasks = useWorkspaceIntents(),
    navigate = useNavigate(),
    location = useLocation(),
    theme = useTheme(),
    catalog = useStudioQuery('listWorkspaces', {}).data?.data ?? [];
  const [palette, setPalette] = useState<{ mode: PaletteMode; generation: number } | null>(null),
    [shortcuts, setShortcuts] = useState(false),
    [notice, setNotice] = useState(''),
    [signOutDialog, setSignOutDialog] = useState(false),
    generation = useRef(0);
  const historyKey = recentSearchKey(data.workspace.id, data.currentMember.id),
    [history, setHistory] = useState(() => ({
      key: historyKey,
      rows: readRecentSearches(historyKey),
    }));
  const rows = history.key === historyKey ? history.rows : readRecentSearches(historyKey);
  const remember = (q: string) => {
    const text = q.trim();
    if (!text || rows.includes(text)) return;
    const next = [text, ...rows].slice(0, 5);
    try {
      localStorage.setItem(historyKey, JSON.stringify(next));
    } catch {
      /* Optional personal UI history. */
    }
    setHistory({ key: historyKey, rows: next });
  };
  const prepare = () => {
    onOpenOverlay();
    projectsServices.surfaceOpened();
  };
  const openPalette = (mode: PaletteMode = 'cmd') => {
    prepare();
    setPalette({ mode, generation: ++generation.current });
  };
  const openShortcuts = () => {
    prepare();
    setShortcuts(true);
  };
  const openResult = (result: SearchResultDto) => {
    prepare();
    if (result.kind === 'tasks') tasks.openTask(result.task.id);
    else if (result.kind === 'projects') {
      void navigate({
        to: links.project(
          data.workspace.id,
          result.project.project.id,
          data.preferences.defaultTab,
        ),
      });
    } else if (result.kind === 'people') {
      void navigate({ to: `/w/${data.workspace.id}/members/${result.member.id}` });
    } else if (result.kind === 'files') files.openFile(result.file);
    else tasks.openTask(result.comment.taskId);
  };
  const session = useStudioQuery('getSession', {});
  const [signingOut, setSigningOut] = useState(false),
    [signOutError, setSignOutError] = useState('');
  async function performSignOut(provider = false) {
    if (signingOut || !auth) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      if (provider) {
        submitIdentityLogout(await auth.prepareProviderLogout());
        return;
      }
      await auth.logout();
      setSignOutDialog(false);
      await navigate({ to: '/login', search: {}, replace: true });
    } catch {
      setSignOutError(t('Sign-out could not be confirmed. Please try again.'));
      setSignOutDialog(true);
    } finally {
      setSigningOut(false);
    }
  }
  const enterSignIn = () => {
    authDemo?.reset();
    setPalette(null);
    void navigate({ to: '/login', search: {} });
  };
  const signOut = () => {
    if (session.data?.data.capabilities.dataMode === 'mock') enterSignIn();
    else if (auth && session.data?.data.capabilities.features.authentication === 'implemented') {
      setPalette(null);
      if (session.data.data.capabilities.identityMode === 'oidc') setSignOutDialog(true);
      else void performSignOut();
    } else {
      setPalette(null);
      setSignOutDialog(true);
    }
  };
  const run = (id: CommandId) => {
    const command = commandDefinitions.find((row) => row.id === id)!;
    if (command.page) {
      void navigate({ to: links.workspace(data.workspace.id, command.page) });
      return;
    }
    if (id === 'task') {
      prepare();
      tasks.openTaskForm();
    } else if (id === 'project') projects.newProject();
    else if (id === 'search') openPalette('search');
    else if (id === 'workspace') openPalette('ws');
    else if (id === 'dark') {
      setPalette(null);
      const dark = theme.effectiveDark;
      void settings
        .run('updatePreferences', {
          workspaceId: data.workspace.id,
          body: { theme: dark ? 'light' : 'dark' },
        })
        .then((result) => {
          if (result)
            projectsServices.notice(dark ? t('Light mode on') : t('Dark mode on'), undefined, {
              kind: 'info',
              duration: 1800,
            });
        });
    } else if (id === 'invite') {
      prepare();
      people.invite();
    } else if (id === 'sidebar') toggleSidebar();
    else if (id === 'shortcuts') openShortcuts();
    else if (id === 'settings' || id === 'appearance') {
      void navigate({
        to: links.settings(data.workspace.id, id === 'settings' ? 'workspace' : 'appearance'),
      });
    } else if (id === 'editTask') {
      const taskId = validateRouteSearch(location.search).taskId;
      if (taskId) {
        prepare();
        tasks.openTaskForm(taskId);
      }
    } else if (id === 'signout') signOut();
  };
  useGlobalShortcuts({
    run,
    togglePalette: () => (palette ? setPalette(null) : openPalette()),
    blocked: () =>
      !!document.querySelector(
        '[role="dialog"][aria-modal="true"]:not([data-task-drawer]),[role="menu"],[data-mobile-open=true]',
      ),
  });
  const viewAll = (q: string, category: Parameters<CommandPaletteProps['onViewAll']>[1]) => {
    remember(q);
    void navigate({ to: links.workspace(data.workspace.id, 'search'), search: { q, category } });
  };
  return (
    <SearchIntentContext
      value={{ signOut, openPalette, openShortcuts, openResult, recent: { rows, remember } }}
    >
      {children}
      {palette && (
        <CommandPalette
          key={palette.generation}
          mode={palette.mode}
          data={data}
          workspaces={catalog}
          recent={rows}
          onClose={() => setPalette(null)}
          onCommand={run}
          onResult={openResult}
          onViewAll={viewAll}
          onSwitchWorkspace={(workspaceId) => {
            if (workspaceId !== data.workspace.id) {
              void navigate({ to: links.workspace(workspaceId, 'home') });
            }
          }}
          onSuggestion={(kind) => {
            if (kind === 'mine') run('my');
            else if (kind === 'overdue') {
              void navigate({
                to: links.workspace(data.workspace.id, 'tasks'),
                search: {
                  view: JSON.stringify(
                    normalizeTaskView({
                      query: { filters: [{ field: 'due', op: 'is', values: ['overdue'] }] },
                    }),
                  ),
                },
              });
            } else {
              const available = data.projects.find(
                (row) => row.access === 'allowed' && row.project.name === 'Website Redesign',
              );
              if (!available) {
                setNotice(t('This project is unavailable.'));
                return;
              }
              if (kind === 'high') {
                void client
                  .execute('listSavedViews', {
                    workspaceId: data.workspace.id,
                    projectId: available.project.id,
                  })
                  .then(
                    (result) => {
                      const view = result.data.find((row) => row.name === 'High priority');
                      if (view)
                        void navigate({
                          to: links.savedView(data.workspace.id, available.project.id, view.id),
                        });
                      else setNotice(t('This saved view is unavailable.'));
                    },
                    () => setNotice(t('This saved view is unavailable.')),
                  );
              } else {
                void navigate({
                  to: links.project(data.workspace.id, available.project.id, 'files'),
                });
              }
            }
          }}
        />
      )}
      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
      {signOutDialog && (
        <Dialog
          open
          size="sm"
          aria-label={t('Sign out')}
          onOpenChange={(open) => {
            if (!open && !signingOut) setSignOutDialog(false);
          }}
        >
          <DialogBody>
            {signOutError ||
              (session.data?.data.capabilities.identityMode === 'oidc'
                ? t(
                    'Sign out of this application, or also end your current Identity session. Other applications check their sessions separately.',
                  )
                : t('This option is not available. Contact your administrator.'))}
          </DialogBody>
          <DialogFooter>
            <Button disabled={signingOut} onClick={() => setSignOutDialog(false)}>
              {t('Cancel')}
            </Button>
            {session.data?.data.capabilities.identityMode === 'oidc' && (
              <>
                <Button loading={signingOut} onClick={() => void performSignOut()}>
                  {t('Sign out of application')}
                </Button>
                <Button disabled={signingOut} onClick={() => void performSignOut(true)}>
                  {t('Sign out of Identity account')}
                </Button>
              </>
            )}
            {signOutError && session.data?.data.capabilities.identityMode !== 'oidc' && (
              <Button loading={signingOut} onClick={() => void performSignOut()}>
                {t('Try again')}
              </Button>
            )}
          </DialogFooter>
        </Dialog>
      )}
      {(notice || settings.error) && (
        <Dialog
          open
          size="sm"
          aria-label={t('Unavailable')}
          onOpenChange={(open) => {
            if (!open) {
              setNotice('');
              settings.clearError();
            }
          }}
        >
          <DialogBody>{notice || settings.error}</DialogBody>
        </Dialog>
      )}
    </SearchIntentContext>
  );
}
