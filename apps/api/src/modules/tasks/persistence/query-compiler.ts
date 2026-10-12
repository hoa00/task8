import type { DateOnly, TaskQuery } from '@studio/contracts/api';
import { estimates, priorities, taskStatuses } from '@studio/contracts/api';
import { addDateDays } from '@studio/domain';
import type { WorkspaceContext } from '../../../db/client.ts';
import type { SqlPredicate } from '../../../db/commands.ts';
import { dateUtf16KeySql, tupleSeekSql } from '../../../db/read-expressions.ts';
import type { CursorPayload } from '../../../shared/cursor.ts';
import { textKeyEncoder } from '../../../shared/collation/encoder.ts';
import { utf16Key, textKeyVersion } from '../../../shared/text-key-encoder.ts';
import { readAccessSql } from '../../projects/access.ts';
export interface TaskReadEnvironment {
  today: DateOnly;
  now: number;
}
export interface TaskQueryPlan {
  inputSql: string;
  fromSql: string;
  where: SqlPredicate;
  invalidKeysSql: string;
  sort: TaskReadSort;
}
export type TaskReadSort =
  | { kind: 'numeric'; valueSql: string; keySql: string }
  | { kind: 'text'; valueSql: string; keySql: string; numericSql: string; numericTypeSql: string };
const input = (field: string) => `json_extract(qi.doc,'$.${field}')`;
const queryField = (field: string) => input('query.' + field);
const textSort = (
  valueSql: string,
  keySql: string,
  numericSql: string,
  numericTypeSql: string,
): TaskReadSort => ({ kind: 'text', valueSql, keySql, numericSql, numericTypeSql });
export function taskReadSort(field: TaskQuery['sortField']): TaskReadSort {
  switch (field) {
    case 'manual':
      return { kind: 'numeric', valueSql: 't.position', keySql: 't.position' };
    case 'title':
      return textSort(
        "json_extract(t.readKeys,'$.title.fold')",
        "(t.readKeys ->> '$.title.foldedUtf16')",
        "json_extract(t.readKeys,'$.title.foldedNumeric')",
        "json_extract(t.readKeys,'$.title.foldedNumericType')",
      );
    case 'due':
    case 'start': {
      const date = field === 'due' ? 't.dueDate' : 't.startDate';
      return textSort(
        `coalesce(${date},'9999')`,
        dateUtf16KeySql(date),
        `CASE WHEN ${date} IS NULL THEN 9999 ELSE NULL END`,
        `CASE WHEN ${date} IS NULL THEN 'finite' ELSE 'NaN' END`,
      );
    }
    case 'priority': {
      const value = `CASE t.priority ${priorities.map((priority) => `WHEN '${priority.id}' THEN ${-priority.weight}`).join(' ')} END`;
      return { kind: 'numeric', valueSql: value, keySql: value };
    }
    case 'status': {
      const value = `CASE t.status ${taskStatuses.map((status, index) => `WHEN '${status.id}' THEN ${index}`).join(' ')} END`;
      return { kind: 'numeric', valueSql: value, keySql: value };
    }
    case 'created':
    case 'updated': {
      const value = field === 'created' ? '-t.createdAt' : '-t.updatedAt';
      return { kind: 'numeric', valueSql: value, keySql: value };
    }
    case 'estimate':
      return textSort(
        "coalesce(t.estimate,'zzz')",
        `CASE t.estimate ${estimates.map((value) => `WHEN '${value}' THEN '${utf16Key(value)}'`).join(' ')} ELSE '${utf16Key('zzz')}' END`,
        'NULL',
        "'NaN'",
      );
    case 'assignee':
      return textSort(
        "coalesce(au.name,'zzz')",
        `coalesce(json_extract(au.readKeys,'$.name.utf16'),'${utf16Key('zzz')}')`,
        "json_extract(au.readKeys,'$.name.numeric')",
        "coalesce(json_extract(au.readKeys,'$.name.numericType'),'NaN')",
      );
    case 'project':
      return textSort(
        'p.name',
        "json_extract(p.readKeys,'$.name.utf16')",
        "json_extract(p.readKeys,'$.name.numeric')",
        "json_extract(p.readKeys,'$.name.numericType')",
      );
  }
}
export function compileTaskQuery(
  scope: WorkspaceContext,
  query: TaskQuery,
  environment: TaskReadEnvironment,
): TaskQueryPlan {
  const invalid = `(json_extract(t.readKeys,'$.v') IS NOT '${textKeyVersion}' OR json_extract(p.readKeys,'$.v') IS NOT '${textKeyVersion}'${query.sortField === 'assignee' ? ` OR (am.id IS NOT NULL AND json_extract(au.readKeys,'$.v') IS NOT '${textKeyVersion}')` : ''})`;
  const predicates = [
    `t.workspaceId=?`,
    `t.deletedAt IS NULL`,
    `p.deletedAt IS NULL`,
    `p.archivedAt IS NULL`,
    readAccessSql,
    query.archived ? 't.archivedAt IS NOT NULL' : 't.archivedAt IS NULL',
  ];
  if (query.projectId) predicates.push(`t.projectId=${queryField('projectId')}`);
  if (query.assigneeId !== undefined)
    predicates.push(`t.assigneeId IS ${queryField('assigneeId')}`);
  if (query.favoriteOnly)
    predicates.push(
      'EXISTS (SELECT 1 FROM taskFavorites f WHERE f.workspaceId=t.workspaceId AND f.taskId=t.id AND f.memberId=?)',
    );
  if (query.q)
    predicates.push(
      `(${invalid} OR instr(json_extract(t.readKeys,'$.title.fold'),${input('q')})>0 OR instr(lower(p.key||'-'||t.number),${input('q')})>0)`,
    );
  query.filters.forEach((filter, index) => {
    if (!filter.values.length) return;
    const values = `json_each(${queryField(`filters[${index}].values`)}) fv`;
    let match: string;
    switch (filter.field) {
      case 'labels':
        match = `EXISTS (SELECT 1 FROM taskLabels l JOIN ${values} ON fv.value=l.labelId WHERE l.workspaceId=t.workspaceId AND l.taskId=t.id)`;
        break;
      case 'assignee':
      case 'status':
      case 'priority':
      case 'project': {
        const column = {
          assignee: 'assigneeId',
          status: 'status',
          priority: 'priority',
          project: 'projectId',
        }[filter.field];
        match = `EXISTS (SELECT 1 FROM ${values} WHERE fv.value IS t.${column})`;
        break;
      }
      case 'created':
      case 'updated': {
        const column = filter.field === 'created' ? 'createdAt' : 'updatedAt';
        match = `EXISTS (SELECT 1 FROM ${values} WHERE ${input('now')}-t.${column} <= CAST(fv.value AS INTEGER)*86400000)`;
        break;
      }
      case 'due':
        match = `EXISTS (SELECT 1 FROM ${values} WHERE CASE fv.value WHEN 'nodate' THEN t.dueDate IS NULL WHEN 'overdue' THEN t.status!='done' AND t.dueDate<${input('today')} WHEN 'today' THEN t.dueDate=${input('today')} WHEN 'week' THEN t.dueDate BETWEEN ${input('today')} AND ${input('weekEnd')} WHEN 'later' THEN t.dueDate>${input('weekEnd')} END)`;
        break;
    }
    predicates.push(filter.op === 'not' ? `NOT (${match})` : match);
  });
  if (query.rangeFrom || query.rangeTo) {
    if (query.rangeBasis === 'due') {
      predicates.push('t.dueDate IS NOT NULL');
      if (query.rangeFrom) predicates.push(`t.dueDate>=${queryField('rangeFrom')}`);
      if (query.rangeTo) predicates.push(`t.dueDate<=${queryField('rangeTo')}`);
    } else {
      predicates.push('(t.startDate IS NOT NULL OR t.dueDate IS NOT NULL)');
      if (query.rangeFrom)
        predicates.push(`coalesce(t.dueDate,t.startDate)>=${queryField('rangeFrom')}`);
      if (query.rangeTo)
        predicates.push(`coalesce(t.startDate,t.dueDate)<=${queryField('rangeTo')}`);
    }
  }
  return {
    inputSql: 'WITH queryInput AS (SELECT ? doc)',
    fromSql:
      'tasks t JOIN projects p ON p.workspaceId=t.workspaceId AND p.id=t.projectId' +
      (query.sortField === 'assignee'
        ? ' LEFT JOIN workspaceMembers am ON am.workspaceId=t.workspaceId AND am.id=t.assigneeId AND am.removedAt IS NULL LEFT JOIN users au ON au.id=am.userId'
        : '') +
      ' CROSS JOIN queryInput qi',
    where: {
      sql: predicates.map((predicate) => `(${predicate})`).join(' AND '),
      parameters: [
        JSON.stringify({
          ...environment,
          weekEnd: addDateDays(environment.today, 7),
          q: textKeyEncoder.lower(query.q),
          query,
        }),
        scope.workspaceId,
        scope.memberId,
        ...(query.favoriteOnly ? [scope.memberId] : []),
      ],
    },
    invalidKeysSql: invalid,
    sort: taskReadSort(query.sortField),
  };
}
export function taskSeek(
  sort: TaskReadSort,
  cursor: CursorPayload,
  direction: TaskQuery['sortDirection'],
): SqlPredicate {
  if (cursor.sortValue === null) return { sql: 'id>?', parameters: [cursor.id] };
  if (sort.kind === 'numeric') {
    const value = Number(cursor.sortValue);
    if (Number.isNaN(value)) return { sql: 'id>?', parameters: [cursor.id] };
    if (!Number.isFinite(value))
      return { sql: (value === Infinity) === (direction === 'desc') ? '1' : '0', parameters: [] };
    return tupleSeekSql('readSortKey', 'id', value, cursor.id, direction);
  }
  if (typeof cursor.sortValue === 'string')
    return tupleSeekSql('readSortKey', 'id', utf16Key(cursor.sortValue), cursor.id, direction);
  const finite = tupleSeekSql('readNumeric', 'id', cursor.sortValue, cursor.id, direction);
  return {
    sql: `(CASE readNumericType WHEN 'NaN' THEN id>? WHEN '+Infinity' THEN ${direction === 'asc' ? 1 : 0} WHEN '-Infinity' THEN ${direction === 'desc' ? 1 : 0} ELSE ${finite.sql} END)`,
    parameters: [cursor.id, ...finite.parameters],
  };
}
