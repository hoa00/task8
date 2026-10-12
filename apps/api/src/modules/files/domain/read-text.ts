import type { TextKeyEncoder } from '../../../shared/text-key-encoder.ts';
import { encodedTextFields } from '../../../shared/text-key-encoder.ts';
export interface ReadTextInput {
  name: string;
  fileType: string;
}
export function fileReadTextKeys(row: ReadTextInput, encoder: TextKeyEncoder): string {
  return encodedTextFields({ name: row.name, fileType: row.fileType }, encoder);
}
