import type { files } from '../../../db/schema.ts';
export type FileRow = Omit<typeof files.$inferSelect, 'readKeys'>;
export interface FileParent {
  table: 'tasks' | 'projects';
  id: string;
  version: number;
}
export type FileIntentProjection = FileRow & { actorValid: number };
