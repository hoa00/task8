import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.ts';
import { ApiFailure } from '../errors.ts';
import type { EntityId } from '@studio/contracts/api';
export interface WorkspaceContext { workspaceId: EntityId; memberId: EntityId }
export const queryLimits = { statements: 50, parametersPerStatement: 100, batchStatements: 50 } as const;
export class RequestRepository {
  readonly db;
  statements = 0;
  constructor(readonly binding: D1Database) { this.db = drizzle(binding, { schema }); }
  reserve(count: number) {
    if (!Number.isSafeInteger(count) || count < 1 || this.statements + count > queryLimits.statements) throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Query budget exceeded');
    this.statements += count;
  }
  prepare(sql: string, parameters: readonly (string | number | null)[] = []) {
    if (parameters.length > queryLimits.parametersPerStatement) throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Too many query parameters');
    return this.binding.prepare(sql).bind(...parameters);
  }
  async all<T>(sql: string, parameters: readonly (string | number | null)[] = []) {
    const statement = this.prepare(sql, parameters); this.reserve(1);
    return (await statement.all<T>()).results;
  }
  async batch(statements: D1PreparedStatement[]) {
    if (!statements.length || statements.length > queryLimits.batchStatements) throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Batch exceeds query budget');
    this.reserve(statements.length);
    return this.binding.batch(statements);
  }
}
