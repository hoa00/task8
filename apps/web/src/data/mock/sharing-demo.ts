import { EntityIdSchema } from '@studio/contracts/api';
import { z } from 'zod';
import type { Clock } from '@studio/domain';
import type { MockStorage } from './persistence.ts';
import type { SharingDemoAdapter } from '../sharing-demo.ts';
import { sharingPermissions } from '../sharing-demo.ts';
import { newMockId } from './primitives.ts';
const stateSchema = z.strictObject({
  visibility: z.enum(['workspace', 'private']),
  memberIds: z.array(z.string()).refine((ids) => new Set(ids).size === ids.length),
  permissions: z.record(z.string(), z.enum(sharingPermissions)),
  guests: z.array(
    z.strictObject({
      id: EntityIdSchema,
      name: z.string(),
      email: z.email(),
      avatarColor: z.string(),
    }),
  ),
  version: z.number().int().positive(),
});
export function createSharingDemo(clock: Clock, storage?: MockStorage): SharingDemoAdapter {
  const memory = new Map<string, z.infer<typeof stateSchema>>();
  const keyFor = (workspaceId: string, principalId: string, projectId: string) =>
    `task8.demo.sharing.v1:${workspaceId}:${principalId}:${projectId}`;
  return {
    read(project, members, principalId) {
      const key = keyFor(project.workspaceId, principalId, project.id);
      if (memory.has(key)) return structuredClone(memory.get(key)!);
      try {
        const raw = storage?.getItem(key);
        if (raw) {
          const state = stateSchema.parse(JSON.parse(raw));
          memory.set(key, state);
          return structuredClone(state);
        }
      } catch {
        /* Invalid demo preferences use read-only real membership. */
      }
      const state = stateSchema.parse({
        visibility: project.visibility,
        memberIds: project.memberIds,
        permissions: Object.fromEntries(
          members.map((member) => [
            member.id,
            member.id === project.leadId
              ? 'Full access'
              : member.role === 'Guest'
                ? 'Can comment'
                : 'Can edit',
          ]),
        ),
        guests: [],
        version: 1,
      });
      memory.set(key, state);
      return structuredClone(state);
    },
    write(project, principalId, expectedVersion, next) {
      const key = keyFor(project.workspaceId, principalId, project.id),
        current = memory.get(key);
      if (!current || current.version !== expectedVersion)
        throw Error('Sharing changed. Reopen this dialog and try again.');
      if (!next.memberIds.includes(project.leadId))
        throw Error('The project lead must keep access');
      const state = stateSchema.parse({ ...next, version: current.version + 1 });
      memory.set(key, state);
      try {
        storage?.setItem(key, JSON.stringify(state));
      } catch {
        /* The current demo remains available for this visit. */
      }
      return structuredClone(state);
    },
    guest(email) {
      return {
        id: newMockId(clock),
        name: email
          .split('@')[0]!
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        email,
        avatarColor: '#6B7280',
      };
    },
  };
}
