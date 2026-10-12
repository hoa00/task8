import type { SqlPredicate, SqlValue } from './commands.ts';

const digitWeights = ['12', '14', '16', '18', '1a', '1c', '1e', '20', '22', '24'] as const;
// Fixed-position ASCII encodings are deliberately limited to canonical date
// shapes. CASE per code point avoids overlapping/cascading replacement tokens.
function asciiWeights(
  expression: string,
  length: number,
  weights: Readonly<Record<string, string>>,
): string {
  return (
    '(' +
    Array.from(
      { length },
      (_, index) =>
        `(CASE substr(${expression},${index + 1},1) ${Object.entries(weights)
          .map(([character, weight]) => `WHEN '${character}' THEN '${weight}'`)
          .join(' ')} ELSE NULL END)`,
    ).join('||') +
    ')'
  );
}
const dateWeights = {
  ...Object.fromEntries(digitWeights.map((weight, index) => [String(index), weight])),
  '-': '050e',
};
export function instantLocaleKeySql(epochExpression: string): string {
  const iso = `strftime('%Y-%m-%dT%H:%M:%fZ',(${epochExpression})/1000.0,'unixepoch')`;
  return `(${asciiWeights(iso, 24, { ...dateWeights, T: '51', ':': '0736', '.': '08', Z: '5d' })}||'011c01bcdcbadc00')`;
}
export function dueLocaleKeySql(dateExpression: string): string {
  return `(CASE WHEN ${dateExpression} IS NULL THEN '242424240108010800' ELSE ${asciiWeights(dateExpression, 10, dateWeights)}||'010e010e00' END)`;
}
export function dateUtf16KeySql(dateExpression: string): string {
  const weights = {
    ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index), '003' + index])),
    '-': '002d',
  };
  return `(CASE WHEN ${dateExpression} IS NULL THEN '0039003900390039' ELSE ${asciiWeights(dateExpression, 10, weights)} END)`;
}
export function tupleSeekSql(
  valueExpression: string,
  idExpression: string,
  value: SqlValue,
  id: string,
  primaryDirection: 'asc' | 'desc',
  idDirection: 'asc' | 'desc' = 'asc',
): SqlPredicate {
  const primary = primaryDirection === 'desc' ? '<' : '>';
  const tie = idDirection === 'desc' ? '<' : '>';
  return {
    sql: `(${valueExpression}${primary}? OR (${valueExpression}=? AND ${idExpression}${tie}?))`,
    parameters: [value, value, id],
  };
}
