import { getTableColumns } from 'drizzle-orm';
import { ApiFailure } from '../shared/errors.ts';
import type { RequestRepository } from './repository.ts';
import * as schema from './schema.ts';
export type SqlValue = string | number | null;
export interface SqlPredicate {
  sql: string;
  parameters: SqlValue[];
}

const commandTables = {
  users: schema.users,
  workspaces: schema.workspaces,
  workspaceMembers: schema.workspaceMembers,
  teams: schema.teams,
  projects: schema.projects,
  projectMembers: schema.projectMembers,
  tasks: schema.tasks,
  subtasks: schema.subtasks,
  taskLabels: schema.taskLabels,
  taskDependencies: schema.taskDependencies,
  comments: schema.comments,
  commentReactions: schema.commentReactions,
  files: schema.files,
  activity: schema.activity,
  notifications: schema.notifications,
  savedViews: schema.savedViews,
  taskFavorites: schema.taskFavorites,
  projectFavorites: schema.projectFavorites,
  memberProjectOrder: schema.memberProjectOrder,
  memberPreferences: schema.memberPreferences,
  calendarEvents: schema.calendarEvents,
  projectMilestones: schema.projectMilestones,
  commandUndoRecords: schema.commandUndoRecords,
};
export type CommandTable = keyof typeof commandTables;
function assertColumns(table: CommandTable, columns: readonly string[]) {
  const target = commandTables[table];
  if (!target) throw new ApiFailure('INTERNAL_ERROR', 'Unknown internal command table');
  const allowed = new Set(Object.keys(getTableColumns(target)));
  if (columns.some((column) => !allowed.has(column)))
    throw new ApiFailure('INTERNAL_ERROR', 'Unknown internal command column');
}
// Compare both directions. A new association, missing target, ABA/version or lifecycle
// change invalidates the root guard before any command side effect is enabled.
export function exactSet<Row extends object>(
  table: CommandTable,
  where: string,
  parameters: SqlValue[],
  rows: readonly Row[],
  columns: readonly Extract<keyof Row, string>[],
): SqlPredicate {
  assertColumns(table, columns);
  const actual = `SELECT ${columns.join(',')} FROM ${table} WHERE ${where}`;
  const expected = `SELECT ${columns.map((column) => `json_extract(value,'$.${column}')`).join(',')} FROM json_each(?)`;
  const json = JSON.stringify(rows);
  return {
    sql: `NOT EXISTS (${actual} EXCEPT ${expected}) AND NOT EXISTS (${expected} EXCEPT ${actual})`,
    parameters: [...parameters, json, json, ...parameters],
  };
}
export function gatedInsert<Row extends object>(
  r: RequestRepository,
  table: CommandTable,
  rows: readonly Row[],
  gate: SqlPredicate,
) {
  if (!rows.length) throw new TypeError('Empty insert plan');
  const columns = Object.keys(rows[0] ?? {});
  assertColumns(table, columns);
  return r.prepare(
    `INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map((column) => `json_extract(value,'$.${column}')`).join(',')} FROM json_each(?) WHERE ${gate.sql}`,
    [JSON.stringify(rows), ...gate.parameters],
  );
}
export async function matchedBatch(r: RequestRepository, statements: D1PreparedStatement[]) {
  const results = await r.batch(statements);
  if (results[0]?.meta.changes !== 1)
    throw new ApiFailure('CONFLICT', 'Version, authorization or command scope changed');
  return results;
}

export const markerSql = (table: 'projects' | 'teams' | 'workspaces' | 'users') =>
  `EXISTS (SELECT 1 FROM ${table} gate WHERE gate.id=? AND gate.lastMutationId=?)`;
export function patchSql(patch: Record<string, string | number | null | undefined>) {
  const entries = Object.entries(patch).filter(
    (entry): entry is [string, string | number | null] => entry[1] !== undefined,
  );
  return {
    sql: entries.map(([key]) => `${key}=?`).join(','),
    parameters: entries.map(([, value]) => value),
  };
}
export function fitBatch(repository: RequestRepository, count: number, finalReads: number) {
  if (count + finalReads > repository.remainingStatements)
    throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Command exceeds query budget');
}
