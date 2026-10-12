import { readFileSync } from 'node:fs';
import { createTextKeyEncoder } from '../src/shared/text-key-encoder.ts';
import { taskReadTextKeys } from '../src/modules/tasks/domain/read-text.ts';
import { projectReadTextKeys } from '../src/modules/projects/domain/read-text.ts';
import { profileReadTextKeys } from '../src/modules/members/domain/read-text.ts';
import { fileReadTextKeys } from '../src/modules/files/domain/read-text.ts';
import { commentReadTextKeys } from '../src/modules/comments/domain/read-text.ts';
const encoder = createTextKeyEncoder(
  new WebAssembly.Module(
    readFileSync(new URL('../src/shared/collation/icu78-en-US.wasm', import.meta.url)),
  ),
);
export const readKeyFields = {
  users: ['name', 'displayEmail', 'title'],
  projects: ['name', 'description', 'key'],
  tasks: ['title', 'descriptionText'],
  files: ['name', 'fileType'],
  comments: ['bodyText'],
};
export function readKeysFor(table, row) {
  for (const field of readKeyFields[table] ?? [])
    if (typeof row[field] !== 'string')
      throw new TypeError('Invalid read-text input: ' + table + '.' + field);
  switch (table) {
    case 'users':
      return profileReadTextKeys(row, encoder);
    case 'projects':
      return projectReadTextKeys(row, encoder);
    case 'tasks':
      return taskReadTextKeys(row, encoder);
    case 'files':
      return fileReadTextKeys(row, encoder);
    case 'comments':
      return commentReadTextKeys(row, encoder);
    default:
      throw new TypeError('Unknown read-key table');
  }
}
export function withReadKeys(table, row) {
  return Object.hasOwn(readKeyFields, table) ? { ...row, readKeys: readKeysFor(table, row) } : row;
}
