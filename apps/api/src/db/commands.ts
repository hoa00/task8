import { ApiFailure } from '../errors.ts';
import type { RequestRepository } from './repository.ts';
export type SqlValue = string | number | null;
export interface SqlPredicate {
  sql: string;
  parameters: SqlValue[];
}

// Compare both directions. A new association, missing target, ABA/version or lifecycle
// change invalidates the root guard before any command side effect is enabled.
export function exactSet(
  table: string,
  where: string,
  parameters: SqlValue[],
  rows: Record<string, unknown>[],
  columns: string[],
): SqlPredicate {
  const actual = `SELECT ${columns.join(',')} FROM ${table} WHERE ${where}`;
  const expected = `SELECT ${columns.map((column) => `json_extract(value,'$.${column}')`).join(',')} FROM json_each(?)`;
  const json = JSON.stringify(rows);
  return {
    sql: `NOT EXISTS (${actual} EXCEPT ${expected}) AND NOT EXISTS (${expected} EXCEPT ${actual})`,
    parameters: [...parameters, json, json, ...parameters],
  };
}
export function gatedInsert(
  r: RequestRepository,
  table: string,
  rows: Record<string, unknown>[],
  gate: SqlPredicate,
) {
  if (!rows.length) throw new TypeError('Empty insert plan');
  const columns = Object.keys(rows[0]!);
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
