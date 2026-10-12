import type { teams, workspaceMembers } from '../../../db/schema.ts';
export type TeamRow = typeof teams.$inferSelect;
export type MemberRow = typeof workspaceMembers.$inferSelect;
