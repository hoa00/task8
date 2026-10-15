import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { useRef, useState } from 'react';
import type { RefObject, ReactNode } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  ColorDot,
  Icon,
  IconButton,
  Input,
  Menu,
  MenuGroup,
  MenuItem,
  MenuSeparator,
  Popover,
  SegmentedControl,
  Select,
} from '@studio/ui';
import type { IconName } from '@studio/ui';
import { TaskFilterSchema, labels, priorities, taskStatuses } from '@studio/contracts/api';
import type { MemberDisplayDto, ProjectDto, TaskFilter, TaskQuery } from '@studio/contracts/api';
import { dueBuckets, taskColumns } from '@studio/domain';
import type { TaskColumnId, TaskGroupBy, TaskViewState } from '@studio/domain';
import { MemberIdentity } from '../people/MemberIdentity';
import { PriorityIcon, TaskStatusIcon } from './atoms';
export interface FilterLookups {
  members: readonly MemberDisplayDto[];
  projects: readonly Pick<ProjectDto, 'id' | 'name' | 'color'>[];
  currentMemberId: string;
}
const filterFields: readonly { id: TaskFilter['field']; name: string; icon: IconName }[] = [
  { id: 'status', name: 'Status', icon: 'circle-dot' },
  { id: 'assignee', name: 'Assignee', icon: 'user' },
  { id: 'priority', name: 'Priority', icon: 'signal-high' },
  { id: 'due', name: 'Due date', icon: 'calendar' },
  { id: 'project', name: 'Project', icon: 'folder' },
  { id: 'labels', name: 'Labels', icon: 'tag' },
  { id: 'created', name: 'Created date', icon: 'calendar-plus' },
  { id: 'updated', name: 'Updated date', icon: 'history' },
];
interface FilterOption {
  value: string | null;
  name: string;
  icon?: ReactNode;
}
function filterOptions(
  field: TaskFilter['field'],
  lookups: FilterLookups,
): readonly FilterOption[] {
  switch (field) {
    case 'status':
      return taskStatuses.map((value) => ({
        value: value.id,
        name: t(value.name),
        icon: <TaskStatusIcon status={value.id} />,
      }));
    case 'priority':
      return priorities.map((value) => ({
        value: value.id,
        name: t(value.name),
        icon: <PriorityIcon priority={value.id} />,
      }));
    case 'assignee':
      return [
        { value: null, name: t('Unassigned'), icon: <MemberIdentity member={null} avatarOnly /> },
        ...lookups.members.map((member) => ({
          value: member.id,
          name: member.name + (member.id === lookups.currentMemberId ? t(' (you)') : ''),
          icon: <MemberIdentity member={member} avatarOnly />,
        })),
      ];
    case 'project':
      return lookups.projects.map((project) => ({
        value: project.id,
        name: project.name,
        icon: <ColorDot color={project.color} />,
      }));
    case 'labels':
      return labels.map((label) => ({
        value: label.id,
        name: t(label.name),
        icon: <ColorDot color={`var(--${label.colorToken})`} />,
      }));
    case 'due':
      return dueBuckets.map((bucket) => ({ value: bucket.id, name: t(bucket.name) }));
    case 'created':
    case 'updated':
      return [
        { value: '1', name: t('Last 24 hours') },
        { value: '7', name: t('Last 7 days') },
        { value: '30', name: t('Last 30 days') },
      ];
  }
}
const names = (filter: TaskFilter, lookups: FilterLookups) =>
  filter.values.map(
    (value) =>
      filterOptions(filter.field, lookups).find((option) => option.value === value)?.name ??
      String(value),
  );
function toggleFilterValue(filter: TaskFilter, value: string | null): TaskFilter {
  const values: readonly (string | null)[] = filter.values;
  return TaskFilterSchema.parse({
    ...filter,
    values: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
  });
}
export interface FilterBuilderProps {
  filters: readonly TaskFilter[];
  onChange: (filters: TaskFilter[]) => void;
  lookups: FilterLookups;
}
function FilterValues({
  filter,
  lookups,
  onChange,
}: {
  filter: TaskFilter;
  lookups: FilterLookups;
  onChange: (filter: TaskFilter) => void;
}) {
  useTranslation();
  return (
    <>
      {filterOptions(filter.field, lookups).map((option) => (
        <label
          key={option.value ?? 'unassigned'}
          className="flex min-h-[30px] cursor-pointer items-center gap-[9px] whitespace-nowrap rounded-sm px-2 text-body source-hover:bg-surface-2"
        >
          <Checkbox
            checked={(filter.values as readonly (string | null)[]).includes(option.value)}
            onCheckedChange={() => onChange(toggleFilterValue(filter, option.value))}
          />
          <span className="contents" aria-hidden="true">
            {option.icon}
          </span>
          {option.name}
        </label>
      ))}
    </>
  );
}
export function FilterBuilder({ filters, onChange, lookups }: FilterBuilderProps) {
  useTranslation();
  const [edit, setEdit] = useState<number | null>(null);
  const replace = (index: number, filter: TaskFilter) =>
    onChange(filters.map((current, i) => (i === index ? filter : current)));
  return (
    <>
      <div className="flex min-h-[30px] items-center justify-between px-2 py-1 text-2xs font-semibold uppercase tracking-[.06em] text-muted">
        {t('Filter by')}
        {filters.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="-mr-1 normal-case tracking-normal"
            onClick={() => {
              onChange([]);
              setEdit(null);
            }}
          >
            {t('Clear all')}
          </Button>
        )}
      </div>
      {filters.length ? (
        <div className="flex flex-col gap-[6px] px-2 pb-[6px] pt-[2px]">
          {filters.map((filter, index) => (
            <div key={index}>
              <div className="task-filter-row grid grid-cols-[44px_120px_84px_minmax(0,1fr)_26px] items-center gap-[6px]">
                <span className="task-filter-conjunction pr-1 text-right text-xs text-muted">
                  {index ? t('and') : t('Where')}
                </span>
                <Select
                  label={t('Field')}
                  className="h-[26px]! text-sm!"
                  value={filter.field}
                  options={filterFields.map((field) => ({ value: field.id, label: t(field.name) }))}
                  onValueChange={(field) => {
                    replace(index, TaskFilterSchema.parse({ field, op: filter.op, values: [] }));
                    setEdit(null);
                  }}
                />
                <Select
                  label={t('Operator')}
                  className="h-[26px]! text-sm!"
                  value={filter.op}
                  options={[
                    { value: 'is', label: t('is') },
                    { value: 'not', label: t('is not') },
                  ]}
                  onValueChange={(op) => replace(index, TaskFilterSchema.parse({ ...filter, op }))}
                />
                <button
                  type="button"
                  className="flex h-[26px] items-center gap-[6px] overflow-hidden whitespace-nowrap rounded-sm border border-solid border-border-strong bg-surface px-2 text-left text-sm source-hover:bg-surface-2"
                  aria-label={t('Filter values')}
                  aria-expanded={edit === index}
                  onClick={() => setEdit(edit === index ? null : index)}
                >
                  <span className={`flex-1 truncate ${filter.values.length ? '' : 'text-muted'}`}>
                    {names(filter, lookups)
                      .map((name) =>
                        filter.field === 'assignee' || filter.field === 'project' ? name : t(name),
                      )
                      .join(', ') || t('Select…')}
                  </span>
                  <Icon name="chevron-down" size={12} />
                </button>
                <IconButton
                  size="xs"
                  aria-label={t('Remove filter')}
                  onClick={() => {
                    onChange(filters.filter((_, i) => i !== index));
                    setEdit(null);
                  }}
                >
                  <Icon name="trash-2" size={13} />
                </IconButton>
              </div>
              {edit === index && (
                <div className="mt-[6px] ml-[50px] max-h-[200px] overflow-auto rounded-default border border-solid border-border p-1 [&_label]:min-h-[28px]">
                  <FilterValues
                    filter={filter}
                    lookups={lookups}
                    onChange={(next) => replace(index, next)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 px-2 pb-2 pt-[2px] text-sm text-muted">
          {t(
            'No filters applied. Combine filters to narrow the task list, e.g. Status is In Progress and Assignee is Sarah.',
          )}
        </p>
      )}
      <MenuSeparator />
      <div className="flex flex-wrap items-center gap-1 px-2 pb-[6px] pt-1 text-xs">
        <span className="mr-1 text-muted">{t('Add filter:')}</span>
        {filterFields.map((field) => (
          <button
            key={field.id}
            type="button"
            className="inline-flex h-5 items-center gap-[5px] whitespace-nowrap rounded-[5px] border border-solid border-border bg-surface-2 px-[7px] text-xs font-medium text-secondary"
            onClick={() => {
              onChange([
                ...filters,
                TaskFilterSchema.parse({ field: field.id, op: 'is', values: [] }),
              ]);
              setEdit(filters.length);
            }}
          >
            <Icon name={field.icon} size={11} />
            {t(field.name)}
          </button>
        ))}
      </div>
    </>
  );
}
function FilterChip({
  filter,
  index,
  filters,
  onChange,
  lookups,
  open,
  onOpenChange,
}: FilterBuilderProps & {
  filter: TaskFilter;
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useTranslation();
  const anchor = useRef<HTMLButtonElement>(null);
  const field = filterFields.find((value) => value.id === filter.field)!;
  const values = names(filter, lookups);
  return (
    <>
      {index > 0 && <span>{t('and')}</span>}
      <span className="inline-flex h-[26px] items-center gap-[6px] rounded-sm border border-solid border-accent-line bg-accent-soft pl-2 pr-1 text-xs text-foreground">
        <button
          ref={anchor}
          type="button"
          className="inline-flex items-center gap-[5px]"
          aria-label={t('Edit {{value1}} filter', { value1: t(field.name) })}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <Icon name={field.icon} size={12} />
          <b className="font-medium text-secondary">{t(field.name)}</b>{' '}
          {filter.op === 'not' ? t('is not') : t('is')}{' '}
          <span>
            {!values.length
              ? t('any')
              : values.length > 2
                ? t('{{value1}} selected', { value1: String(values.length) })
                : values.join(', ')}
          </span>
        </button>
        <IconButton
          className="size-[18px]! text-secondary!"
          aria-label={t('Remove filter')}
          onClick={() => {
            onChange(filters.filter((_, i) => i !== index));
            onOpenChange(false);
          }}
        >
          <Icon name="x" size={12} />
        </IconButton>
      </span>
      <Popover open={open} anchor={anchor} onOpenChange={onOpenChange}>
        <MenuGroup label={`${t(field.name)} ${filter.op === 'not' ? t('is not') : t('is')}`} />
        <FilterValues
          filter={filter}
          lookups={lookups}
          onChange={(next) => onChange(filters.map((current, i) => (i === index ? next : current)))}
        />
      </Popover>
    </>
  );
}
export function FilterChips({ filters, onChange, lookups }: FilterBuilderProps) {
  useTranslation();
  const [edit, setEdit] = useState<number | null>(null),
    [add, setAdd] = useState(false);
  const addAnchor = useRef<HTMLButtonElement>(null);
  if (!filters.length) return null;
  return (
    <div className="task-filter-chips flex flex-wrap items-center gap-[6px] border-0 border-b border-solid border-border px-[var(--gutter)] py-2 text-xs text-muted">
      <Icon name="list-filter" size={13} />
      {filters.map((filter, index) => (
        <FilterChip
          key={index}
          filter={filter}
          index={index}
          filters={filters}
          onChange={onChange}
          lookups={lookups}
          open={edit === index}
          onOpenChange={(open) => setEdit(open ? index : null)}
        />
      ))}
      <Button ref={addAnchor} size="sm" variant="ghost" onClick={() => setAdd(!add)}>
        <Icon name="plus" size={12} />
        {t('Add')}
      </Button>
      <span className="flex-1" />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          onChange([]);
          setEdit(null);
        }}
      >
        {t('Clear all')}
      </Button>
      <Popover
        className="task-filter-builder min-w-[440px]! max-w-[560px]!"
        open={add}
        anchor={addAnchor}
        onOpenChange={setAdd}
      >
        <FilterBuilder filters={filters} onChange={onChange} lookups={lookups} />
      </Popover>
    </div>
  );
}
interface ControlledMenuProps {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
const sortNames: Record<TaskQuery['sortField'], string> = {
  manual: 'Manual',
  title: 'Title',
  due: 'Due date',
  start: 'Start date',
  priority: 'Priority',
  status: 'Status',
  assignee: 'Assignee',
  created: 'Created',
  updated: 'Updated',
  estimate: 'Estimate',
  project: 'Project',
};
export function SortMenu({
  value,
  onChange,
  ...overlay
}: ControlledMenuProps & {
  value: Pick<TaskQuery, 'sortField' | 'sortDirection'>;
  onChange: (value: Pick<TaskQuery, 'sortField' | 'sortDirection'>) => void;
}) {
  useTranslation();
  return (
    <Menu {...overlay} label={t('Sort by')} className="w-[240px]">
      <MenuGroup label={t('Sort by')} />
      {(
        [
          'manual',
          'priority',
          'due',
          'start',
          'title',
          'status',
          'assignee',
          'created',
          'updated',
        ] as const
      ).map((field) => (
        <MenuItem
          key={field}
          checked={value.sortField === field}
          onSelect={() => {
            onChange({ ...value, sortField: field });
            overlay.onOpenChange(false);
          }}
        >
          {field === 'updated' ? t('Last updated') : t(sortNames[field])}
        </MenuItem>
      ))}
      <MenuSeparator />
      <div className="px-[6px] py-1">
        <SegmentedControl
          label={t('Sort direction')}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          value={value.sortDirection}
          onValueChange={(direction) =>
            onChange({ ...value, sortDirection: direction as TaskQuery['sortDirection'] })
          }
          items={[
            { value: 'asc', label: t('Ascending'), icon: <Icon name="arrow-up" size={12} /> },
            { value: 'desc', label: t('Descending'), icon: <Icon name="arrow-down" size={12} /> },
          ]}
        />
      </div>
    </Menu>
  );
}
const groups: readonly { id: TaskGroupBy; name: string; icon: IconName }[] = [
  { id: 'status', name: 'Status', icon: 'circle-dot' },
  { id: 'priority', name: 'Priority', icon: 'signal-high' },
  { id: 'assignee', name: 'Assignee', icon: 'user' },
  { id: 'project', name: 'Project', icon: 'folder' },
  { id: 'due', name: 'Due date', icon: 'calendar' },
  { id: 'none', name: 'No grouping', icon: 'minus' },
];
export function GroupMenu({
  value,
  onChange,
  ...overlay
}: ControlledMenuProps & { value: TaskGroupBy; onChange: (value: TaskGroupBy) => void }) {
  useTranslation();
  return (
    <Menu {...overlay} label={t('Group by')}>
      <MenuGroup label={t('Group by')} />
      {groups.map((group) => (
        <MenuItem
          key={group.id}
          checked={group.id === value}
          icon={<Icon name={group.icon} size={15} />}
          onSelect={() => {
            onChange(group.id);
            overlay.onOpenChange(false);
          }}
        >
          {t(group.name)}
        </MenuItem>
      ))}
    </Menu>
  );
}
export function ColumnMenu({
  hidden,
  onChange,
  onResetWidths,
  ...overlay
}: ControlledMenuProps & {
  hidden: readonly TaskColumnId[];
  onChange: (hidden: TaskColumnId[]) => void;
  onResetWidths: () => void;
}) {
  useTranslation();
  return (
    <Popover {...overlay} aria-label={t('Visible columns')}>
      <MenuGroup label={t('Visible columns')} />
      {taskColumns
        .filter((column) => column.id !== 'title')
        .map((column) => (
          <label
            key={column.id}
            className="flex min-h-[30px] cursor-pointer items-center gap-[9px] whitespace-nowrap rounded-sm px-2 text-body source-hover:bg-surface-2"
          >
            <Checkbox
              checked={!hidden.includes(column.id)}
              onCheckedChange={(visible) =>
                onChange(visible ? hidden.filter((id) => id !== column.id) : [...hidden, column.id])
              }
            />
            {t(column.name)}
          </label>
        ))}
      <MenuSeparator />
      <MenuItem icon={<Icon name="rotate-ccw" size={14} />} onSelect={onResetWidths}>
        {t('Reset widths')}
      </MenuItem>
    </Popover>
  );
}
export interface TaskViewToolbarProps {
  value: TaskViewState;
  onChange: (value: TaskViewState) => void;
  lookups: FilterLookups;
  group?: boolean;
  columns?: boolean;
  extra?: ReactNode;
  right?: ReactNode;
}
export function TaskViewToolbar({
  value,
  onChange,
  lookups,
  group = true,
  columns = false,
  extra,
  right,
}: TaskViewToolbarProps) {
  useTranslation();
  const [open, setOpen] = useState<'filter' | 'sort' | 'group' | 'columns' | null>(null);
  const filter = useRef<HTMLButtonElement>(null),
    sort = useRef<HTMLButtonElement>(null),
    grouping = useRef<HTMLButtonElement>(null),
    column = useRef<HTMLButtonElement>(null);
  const updateFilters = (filters: TaskFilter[]) =>
    onChange({ ...value, query: { ...value.query, filters } });
  return (
    <>
      <div
        role="toolbar"
        className="task-view-toolbar flex min-h-11 flex-wrap items-center gap-1 border-0 border-b border-solid border-border px-[var(--gutter)] py-2"
      >
        <div className="relative flex items-center">
          <Icon
            name="search"
            size={13}
            className="absolute left-[9px] pointer-events-none text-faint"
          />
          <Input
            value={value.query.q}
            size="sm"
            className="w-[200px]! pl-[30px]"
            aria-label={t('Search tasks')}
            placeholder={t('Search tasks')}
            onChange={(event) =>
              onChange({ ...value, query: { ...value.query, q: event.target.value } })
            }
          />
        </div>
        <Button
          ref={filter}
          size="sm"
          variant="ghost"
          className="text-xs!"
          aria-pressed={value.query.filters.length > 0}
          onClick={() => setOpen(open === 'filter' ? null : 'filter')}
        >
          <Icon name="list-filter" size={14} />
          {t('Filter')}
          {value.query.filters.length > 0 && (
            <Badge tone="accent" className="h-4! px-[5px]!">
              {value.query.filters.length}
            </Badge>
          )}
        </Button>
        <Button
          ref={sort}
          size="sm"
          variant="ghost"
          className="text-xs!"
          onClick={() => setOpen(open === 'sort' ? null : 'sort')}
        >
          <Icon name="arrow-up-down" size={14} />
          <span className="task-hide-mobile">{t('Sort:')}</span>{' '}
          {t(sortNames[value.query.sortField])}
        </Button>
        {group && (
          <Button
            ref={grouping}
            size="sm"
            variant="ghost"
            className="text-xs!"
            onClick={() => setOpen(open === 'group' ? null : 'group')}
          >
            <Icon name="rows-3" size={14} />
            <span className="task-hide-mobile">{t('Group:')}</span>{' '}
            {value.groupBy === 'none'
              ? t('None')
              : t(groups.find((item) => item.id === value.groupBy)!.name)}
          </Button>
        )}
        {columns && (
          <Button
            ref={column}
            size="sm"
            variant="ghost"
            className="text-xs!"
            onClick={() => setOpen(open === 'columns' ? null : 'columns')}
          >
            <Icon name="columns-3" size={14} />
            {t('Columns')}
          </Button>
        )}
        {extra}
        <span className="flex-1" />
        {right}
      </div>
      <FilterChips filters={value.query.filters} onChange={updateFilters} lookups={lookups} />
      <Popover
        className="task-filter-builder min-w-[440px]! max-w-[560px]!"
        open={open === 'filter'}
        anchor={filter}
        onOpenChange={(next) => setOpen(next ? 'filter' : null)}
      >
        <FilterBuilder filters={value.query.filters} onChange={updateFilters} lookups={lookups} />
      </Popover>
      <SortMenu
        open={open === 'sort'}
        anchor={sort}
        onOpenChange={(next) => setOpen(next ? 'sort' : null)}
        value={value.query}
        onChange={(query) => onChange({ ...value, query: { ...value.query, ...query } })}
      />
      <GroupMenu
        open={open === 'group'}
        anchor={grouping}
        onOpenChange={(next) => setOpen(next ? 'group' : null)}
        value={value.groupBy}
        onChange={(groupBy) => onChange({ ...value, groupBy })}
      />
      <ColumnMenu
        open={open === 'columns'}
        anchor={column}
        onOpenChange={(next) => setOpen(next ? 'columns' : null)}
        hidden={value.hiddenColumns}
        onChange={(hiddenColumns) => onChange({ ...value, hiddenColumns })}
        onResetWidths={() => onChange({ ...value, columnWidths: {} })}
      />
    </>
  );
}
