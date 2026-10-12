import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle } from 'drizzle-orm/d1';
import { ApiFailure } from '../shared/errors.ts';
import { queryLimits } from '../shared/limits.ts';
import * as schema from './schema.ts';
export { queryLimits } from '../shared/limits.ts';
export type { WorkspaceContext } from '../shared/scope.ts';
export type SqlValue = string | number | null;
type ReadBuilder = Pick<
  DrizzleD1Database<typeof schema>,
  'select' | 'selectDistinct' | 'batch' | 'with'
>;
export interface QueryTrace {
  status: 'success' | 'failure';
  kind: string;
  statements: number;
  parameters: number;
  rowsRead: number | null;
  rowsWritten: number | null;
  returnedRows: number | null;
}

// Native and Drizzle paths share one actual execution boundary. Planning does not reserve queries.
export class RequestRepository {
  readonly #binding: D1Database;
  readonly #database: DrizzleD1Database<typeof schema>;
  readonly #nativeStatements = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  readonly #parameterCounts = new WeakMap<D1PreparedStatement, number>();
  readonly #trace: QueryTrace[] = [];
  #statements = 0;
  constructor(binding: D1Database) {
    this.#binding = binding;
    const accounted = new Proxy(binding, {
      get: (_target, key) => {
        if (key === 'prepare') return (sql: string) => this.#prepare(sql);
        if (key === 'batch') return (statements: D1PreparedStatement[]) => this.batch(statements);
        throw new ApiFailure('INTERNAL_ERROR', 'Unsupported request database execution path');
      },
    });
    this.#database = drizzle(accounted, { schema });
  }
  get statements() {
    return this.#statements;
  }
  get remainingStatements() {
    return queryLimits.statements - this.#statements;
  }
  get trace(): readonly QueryTrace[] {
    return this.#trace.map((row) => ({ ...row }));
  }
  #reserve(count: number) {
    if (!Number.isSafeInteger(count) || count < 1 || count > this.remainingStatements)
      throw new ApiFailure('VIEW_SCOPE_TOO_LARGE', 'Query budget exceeded');
    this.#statements += count;
  }
  #record(
    kind: string,
    count: number,
    parameters: number,
    result: unknown,
    status: 'success' | 'failure' = 'success',
  ) {
    let rowsRead: number | null = null,
      rowsWritten: number | null = null,
      returnedRows: number | null = null;
    if (
      result !== null &&
      typeof result === 'object' &&
      'meta' in result &&
      result.meta !== null &&
      typeof result.meta === 'object'
    ) {
      if ('rows_read' in result.meta && typeof result.meta.rows_read === 'number')
        rowsRead = result.meta.rows_read;
      if ('rows_written' in result.meta && typeof result.meta.rows_written === 'number')
        rowsWritten = result.meta.rows_written;
      if ('results' in result && Array.isArray(result.results))
        returnedRows = result.results.length;
    } else if (Array.isArray(result)) returnedRows = result.length;
    else if (kind === 'first') returnedRows = result === null ? 0 : 1;
    this.#trace.push({
      kind,
      status,
      statements: count,
      parameters,
      rowsRead,
      rowsWritten,
      returnedRows,
    });
  }
  #wrap(statement: D1PreparedStatement, parameters = 0): D1PreparedStatement {
    const proxy = new Proxy(statement, {
      get: (target, key) => {
        if (key === 'bind')
          return (...values: unknown[]) => {
            if (values.length > queryLimits.parametersPerStatement)
              throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Too many query parameters');
            return this.#wrap(target.bind(...values), values.length);
          };
        const value = Reflect.get(target, key, target);
        if (['all', 'run', 'first', 'raw'].includes(String(key)))
          return async (...args: unknown[]) => {
            this.#reserve(1);
            try {
              const result = await value.apply(target, args);
              this.#record(String(key), 1, parameters, result);
              return result;
            } catch (error) {
              this.#record(String(key), 1, parameters, undefined, 'failure');
              throw error;
            }
          };
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    this.#nativeStatements.set(proxy, statement);
    this.#parameterCounts.set(proxy, parameters);
    return proxy;
  }
  #prepare(sql: string) {
    return this.#wrap(this.#binding.prepare(sql));
  }
  prepare(sql: string, parameters: readonly SqlValue[] = []): D1PreparedStatement {
    if (parameters.length > queryLimits.parametersPerStatement)
      throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Too many query parameters');
    return this.#prepare(sql).bind(...parameters);
  }
  async all<T>(sql: string, parameters: readonly SqlValue[] = []): Promise<T[]> {
    return (await this.prepare(sql, parameters).all<T>()).results;
  }
  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    if (!statements.length || statements.length > queryLimits.batchStatements)
      throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Batch exceeds query budget');
    const native = statements.map((statement) => {
      const value = this.#nativeStatements.get(statement);
      if (!value)
        throw new ApiFailure('INTERNAL_ERROR', 'Statement does not belong to this request');
      return value;
    });
    this.#reserve(native.length);
    let results: D1Result<T>[];
    try {
      results = await this.#binding.batch<T>(native);
    } catch (error) {
      for (const statement of statements)
        this.#record('batch', 1, this.#parameterCounts.get(statement) ?? 0, undefined, 'failure');
      throw error;
    }
    for (const [index, result] of results.entries()) {
      const statement = statements[index];
      if (!statement) throw new ApiFailure('INTERNAL_ERROR', 'Unexpected database batch result');
      this.#record('batch', 1, this.#parameterCounts.get(statement) ?? 0, result);
    }
    return results;
  }
  async read<T>(build: (database: ReadBuilder) => PromiseLike<T>): Promise<T> {
    try {
      return await build(this.#database);
    } catch (error) {
      if (error instanceof Error && error.cause instanceof ApiFailure) throw error.cause;
      throw error;
    }
  }
}
