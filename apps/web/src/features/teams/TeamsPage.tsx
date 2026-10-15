import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Alert, Button, EmptyState, Icon, Panel } from '@studio/ui';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { useStudioQuery } from '../../data/queries';
import { useTeamIntents } from './team-intents';
import { TeamGrid } from './TeamGrid';
import { useProjectMotion } from '../projects/project-motion';
import { useProjectIntents } from '../projects/project-intents';
export interface TeamDirectoryProps {
  membersTab?: boolean;
}
export function TeamDirectory({ membersTab = false }: TeamDirectoryProps) {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    data = useWorkspaceBootstrap().data!.data,
    teams = useStudioQuery('listTeams', { workspaceId, query: {} }),
    intents = useTeamIntents(),
    navigate = useNavigate();
  return (
    <div data-team-directory data-teams-ready={teams.data ? '' : undefined}>
      {membersTab && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[13px] text-secondary">
            {data.teams.length}
            {'  '}
            {t('teams')}
          </span>
          <span className="flex-1" />
          <Button variant="secondary" size="sm" onClick={intents.newTeam}>
            <Icon name="plus" size={13} />
            {t('New team')}
          </Button>
        </div>
      )}
      {teams.error ? (
        <Alert tone="danger">
          {teams.error.message}
          <Button
            size="sm"
            onClick={() => {
              void teams.refetch();
            }}
          >
            {t('Retry')}
          </Button>
        </Alert>
      ) : !teams.data ? (
        <div role="status">{t('Loading teams…')}</div>
      ) : teams.data.data.length || membersTab ? (
        <TeamGrid
          teams={teams.data.data}
          data={data}
          onOpen={(id) => {
            void navigate({ to: `/w/${workspaceId}/teams/${id}` });
          }}
        />
      ) : (
        <Panel>
          <EmptyState
            icon="users"
            heading={t('No teams yet')}
            description={t('Create a team to group people and give projects an owner.')}
            action={
              <Button variant="primary" size="sm" onClick={intents.newTeam}>
                <Icon name="plus" size={14} />
                {t('New team')}
              </Button>
            }
          />
        </Panel>
      )}
    </div>
  );
}
export function TeamsPage() {
  useTranslation();
  const data = useWorkspaceBootstrap(),
    intents = useTeamIntents(),
    location = useLocation(),
    projects = useProjectIntents(),
    { hostRef, onAnimationEnd } = useProjectMotion(
      location.pathname,
      String(data.dataUpdatedAt),
      'page',
      projects.overlayState,
    );
  return (
    <div
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion
      className="mx-auto max-w-[1160px] px-[var(--gutter)] pb-[72px] pt-7 source-tablet:pb-24 source-tablet:pt-5"
      data-teams-page
    >
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="m-0 text-balance text-2xl font-semibold leading-[1.2] tracking-[-.022em] source-mobile:text-xl">
            {t('Teams')}
          </h1>
          <p className="mb-0 mt-1 text-body text-secondary">
            {t('Groups of people who work on projects together.')}
          </p>
        </div>
        <div className="ml-auto flex gap-[6px] source-mobile:ml-0 source-mobile:w-full">
          <Button variant="primary" onClick={intents.newTeam}>
            <Icon name="plus" size={14} />
            {t('New team')}
          </Button>
        </div>
      </div>
      <TeamDirectory />
    </div>
  );
}
