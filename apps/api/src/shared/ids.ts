import type { EntityId } from '@studio/contracts/api';
import { EntityIdSchema } from '@studio/contracts/api';
export type IdGenerator = () => EntityId;
export const newId: IdGenerator = () => {
  const stamp = Date.now().toString(16).padStart(12, '0'),
    random = crypto.randomUUID().replaceAll('-', '');
  return EntityIdSchema.parse(
    `${stamp.slice(0, 8)}-${stamp.slice(8)}-7${random.slice(13, 16)}-${random.slice(16, 20)}-${random.slice(20)}`,
  );
};
