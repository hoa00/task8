import type { files } from '../../../db/schema.ts';
export type FileRow = typeof files.$inferSelect;
export interface FileParent {
  table: 'tasks' | 'projects';
  id: string;
  version: number;
}
export type FileIntentProjection = FileRow & { actorValid: number };
