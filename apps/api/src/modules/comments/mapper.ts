import type { CommentDto, ReactionDto } from '@studio/contracts/api';
import { CommentSchema, EntityIdSchema, ReactionSchema } from '@studio/contracts/api';
import { z } from 'zod';
import { instant } from '../../shared/clock.ts';
export interface CommentDtoInput {
  id: string;
  workspaceId: string;
  taskId: string;
  authorId: string;
  bodyText: string;
  mentionedMemberIdsJson: string;
  createdAt: number;
  version: number;
}
export interface ReactionPair {
  key: string;
  memberId: string;
}
export function reactionProjection(pairs: readonly ReactionPair[]): ReactionDto[] {
  return [...new Set(pairs.map((pair) => pair.key))].map((key) => {
    const memberIds = pairs.filter((pair) => pair.key === key).map((pair) => pair.memberId);
    return ReactionSchema.parse({ key, count: memberIds.length, memberIds });
  });
}
export function commentDto(row: CommentDtoInput, reactions: readonly ReactionDto[]): CommentDto {
  return CommentSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    taskId: row.taskId,
    authorId: row.authorId,
    bodyText: row.bodyText,
    mentionedMemberIds: EntityIdSchema.array().parse(JSON.parse(row.mentionedMemberIdsJson)),
    createdAt: instant(row.createdAt),
    version: row.version,
    reactions,
  });
}

const ReactionPairsSchema = z.array(z.object({ key: z.string(), memberId: EntityIdSchema }));
export function reactionsFromJson(json: string): ReactionDto[] {
  return reactionProjection(ReactionPairsSchema.parse(JSON.parse(json)));
}
