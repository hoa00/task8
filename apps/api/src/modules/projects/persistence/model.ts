import type { projects } from '../../../db/schema.ts';
export type ProjectRow = typeof projects.$inferSelect;
