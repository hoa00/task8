import type { projects } from '../../../db/schema.ts';
export type ProjectRow = Omit<typeof projects.$inferSelect, 'readKeys'>;
