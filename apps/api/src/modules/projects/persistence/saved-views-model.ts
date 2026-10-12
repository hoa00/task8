import type { savedViews } from '../../../db/schema.ts';
export type ViewRow = Omit<typeof savedViews.$inferSelect, 'filtersJson'> & { filtersJson: string };
