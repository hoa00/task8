import type { TextKeyEncoder } from '../../../shared/text-key-encoder.ts';
import { encodedTextFields } from '../../../shared/text-key-encoder.ts';
export interface ReadTextInput {
  name: string;
  description: string;
  key: string;
}
export function projectReadTextKeys(row: ReadTextInput, encoder: TextKeyEncoder): string {
  return encodedTextFields({ name: row.name }, encoder, {
    description: row.description,
    key: row.key,
  });
}
