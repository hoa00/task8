import type { comments } from '../../../db/schema.ts';
export type CommentRow = Omit<typeof comments.$inferSelect, 'mentionedMemberIdsJson'> & {
  mentionedMemberIdsJson: string;
};
