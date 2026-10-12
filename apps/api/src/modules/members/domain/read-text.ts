import type { TextKeyEncoder } from '../../../shared/text-key-encoder.ts';
import { encodedTextFields } from '../../../shared/text-key-encoder.ts';
export interface ReadTextInput {
  name: string;
  displayEmail: string;
  title: string;
}
export function profileReadTextKeys(row: ReadTextInput, encoder: TextKeyEncoder): string {
  return encodedTextFields({ name: row.name }, encoder, {
    email: row.displayEmail,
    title: row.title,
  });
}
