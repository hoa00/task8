import type { TextKeyEncoder } from '../../../shared/text-key-encoder.ts';
import { encodedTextFields } from '../../../shared/text-key-encoder.ts';
export interface ReadTextInput {
  title: string;
  descriptionText: string;
}
export function taskReadTextKeys(row: ReadTextInput, encoder: TextKeyEncoder): string {
  return encodedTextFields({ title: row.title }, encoder, { descriptionText: row.descriptionText });
}
