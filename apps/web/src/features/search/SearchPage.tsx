import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Alert, Badge, Button, EmptyState, Icon, Input, Panel, Tabs } from '@studio/ui';
import { useWorkspaceBootstrap, useWorkspaceId } from '../../app/shell/workspace-context';
import { validateRouteSearch } from '../../app/navigation';
import { useDataRuntime } from '../../data/context';
import { useProjectMotion } from '../projects/project-motion';
import { useProjectIntents } from '../projects/project-intents';
import { searchCategories, searchLabel, searchResultId, useWorkspaceSearch } from './search-query';
import type { SearchCategory } from './search-query';
import { useRecentSearches } from './recent-searches';
import { SearchResultContent } from './SearchResultContent';
import { useSearchIntents } from './search-intents';
export function SearchPage() {
  useTranslation();
  const workspaceId = useWorkspaceId(),
    data = useWorkspaceBootstrap().data!.data,
    { clock } = useDataRuntime(),
    location = useLocation(),
    navigate = useNavigate(),
    intents = useSearchIntents(),
    projectIntents = useProjectIntents();
  const route = validateRouteSearch(location.search),
    q = route.q ?? '',
    category = route.category ?? 'all',
    result = useWorkspaceSearch(workspaceId, q, category),
    recent = useRecentSearches();
  const tabsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (tabsRef.current) tabsRef.current.scrollLeft = 0;
  }, [q, category]);
  const consumeSearchAction = () => {
    if (tabsRef.current) tabsRef.current.scrollLeft = 0;
    projectIntents.projectSurfaceOpened();
  };
  const change = (text: string) => {
    void navigate({
      to: location.pathname,
      search: (previous) => ({ ...previous, q: text }),
      replace: true,
    });
  };
  const { hostRef, onAnimationEnd } = useProjectMotion(
    location.pathname,
    `${q}/${category}/${result.dataUpdatedAt}`,
    'page',
    projectIntents.overlayState,
  );
  const totals = result.data?.totals ?? { tasks: 0, projects: 0, people: 0, files: 0, comments: 0 },
    total = Object.values(totals).reduce((a, b) => a + b, 0);
  return (
    <div
      ref={hostRef}
      onAnimationEnd={onAnimationEnd}
      data-project-page-motion
      data-search-page
      data-search-ready={!q.trim() || result.data ? '' : undefined}
      data-search-query={q}
      className="mx-auto max-w-[860px] px-[var(--gutter)] pb-[72px] pt-7 source-tablet:pb-24 source-tablet:pt-5"
    >
      <div className="relative mb-[14px]">
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-[9px] top-1/2 -translate-y-1/2 text-faint"
        />
        <Input
          id="search-page-q"
          size="lg"
          aria-label={t('Search')}
          placeholder={t('Search tasks, projects, people, files, and comments')}
          value={q}
          maxLength={500}
          className="pl-[34px]! text-[15px]!"
          onInput={consumeSearchAction}
          onChange={(event) => change(event.target.value)}
        />
      </div>
      <Tabs
        ref={tabsRef}
        className="mb-[18px]"
        label={t('Search category')}
        value={category}
        items={searchCategories.map((value) => ({
          value,
          label: (
            <>
              {searchLabel(value)}
              <span className="text-2xs font-medium text-muted">
                {value === 'all' ? total : totals[value]}
              </span>
            </>
          ),
        }))}
        onValueChange={(value) => {
          consumeSearchAction();
          void navigate({
            to: location.pathname,
            search: (previous) => ({ ...previous, category: value as SearchCategory }),
            replace: true,
          });
        }}
      />
      {!q ? (
        <div className="flex flex-wrap items-center gap-[6px]">
          <span className="text-[12.5px] text-muted">{t('Recent:')}</span>
          {recent.rows.map((text) => (
            <button
              key={text}
              className="inline-flex"
              onClick={() => {
                change(text);
              }}
            >
              <Badge>
                <Icon name="history" size={11} />
                {text}
              </Badge>
            </button>
          ))}
        </div>
      ) : result.error ? (
        <Alert tone="danger">
          {result.error.message}
          <Button
            size="sm"
            onClick={() => {
              void result.retrySearch();
            }}
          >
            {t('Try again')}
          </Button>
        </Alert>
      ) : q.trim() && (result.debouncing || result.isPending) ? (
        <div role="status" className="text-sm text-muted">
          {t('Searching…')}
        </div>
      ) : total ? (
        searchCategories
          .filter((value) => value !== 'all' && (category === 'all' || category === value))
          .map((value) => {
            const rows = result.data?.items.filter((row) => row.kind === value) ?? [];
            return rows.length ? (
              <section key={value} className="mb-[22px]">
                <div className="mb-[6px] text-2xs font-semibold uppercase tracking-[.07em] text-muted">
                  {searchLabel(value)}
                  {' · '}
                  {value !== 'all' ? totals[value] : 0}
                </div>
                <Panel className="overflow-hidden">
                  {rows.map((row) => (
                    <div
                      key={`${row.kind}:${searchResultId(row)}`}
                      role="button"
                      tabIndex={0}
                      data-search-result={row.kind}
                      className={`search-result flex min-h-[38px] cursor-pointer items-center gap-[10px] border-0 border-t border-solid border-divider px-[14px] text-body transition-[background] [transition-timing-function:ease] first:border-t-0 source-hover:bg-surface-2 ${row.kind === 'comments' ? 'items-start! py-[10px]' : ''}`}
                      onClick={() => {
                        intents.openResult(row);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          intents.openResult(row);
                        }
                      }}
                    >
                      <SearchResultContent result={row} query={q} data={data} now={clock.now()} />
                    </div>
                  ))}
                </Panel>
              </section>
            ) : null;
          })
      ) : (
        <Panel>
          <EmptyState
            icon="search-x"
            heading={t('No results found')}
            description={t(
              'Nothing matches “{{value1}}”. Check the spelling or try a broader term.',
              { value1: String(q) },
            )}
            action={
              <Button variant="secondary" size="sm" onClick={() => change('')}>
                {t('Clear search')}
              </Button>
            }
          />
        </Panel>
      )}
    </div>
  );
}
