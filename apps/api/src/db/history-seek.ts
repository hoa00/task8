import type { SqlPredicate } from './commands.ts';
import { instantLocaleKeySql } from './read-expressions.ts';
import { localeIdSeek } from './locale-seek.ts';
import type { CursorPayload } from '../shared/cursor.ts';
import { textKeyEncoder } from '../shared/collation/encoder.ts';
import { ApiFailure } from '../shared/errors.ts';
export function historySeek(
  epochExpression: string,
  idExpression: string,
  cursor: CursorPayload,
  direction: 'asc' | 'desc',
): SqlPredicate {
  if (typeof cursor.sortValue !== 'string')
    throw new ApiFailure('VALIDATION_ERROR', 'Invalid cursor for query');
  const epoch = Date.parse(cursor.sortValue),
    canonical = Number.isFinite(epoch) && new Date(epoch).toISOString() === cursor.sortValue;
  const value = canonical ? epoch : textKeyEncoder.locale(cursor.sortValue),
    expression = canonical ? epochExpression : instantLocaleKeySql(epochExpression);
  const tie = localeIdSeek(idExpression, cursor.id, direction);
  return {
    sql: `(${expression}${direction === 'desc' ? '<' : '>'}? OR (${expression}=? AND ${tie.sql}))`,
    parameters: [value, value, ...tie.parameters],
  };
}
