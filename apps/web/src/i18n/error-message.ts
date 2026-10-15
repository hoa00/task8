import { translate } from './i18n.ts';
// Features translate canonical system errors at their presentation boundary.
// Transport keeps the original envelope; unknown server wording stays literal.
export function translateErrorMessage(message: string): string;
export function translateErrorMessage(
  message: string | null | undefined,
): string | null | undefined;
export function translateErrorMessage(message: string | null | undefined) {
  return typeof message === 'string' ? translate(message) : message;
}
