import type { TextKeyEncoder } from '../../../shared/text-key-encoder.ts';
import { encodedTextFields } from '../../../shared/text-key-encoder.ts';
export interface ReadTextInput {
  bodyText: string;
}
export function commentReadTextKeys(row: ReadTextInput, encoder: TextKeyEncoder): string {
  return encodedTextFields({}, encoder, { bodyText: row.bodyText });
}
