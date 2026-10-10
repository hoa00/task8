import type { MockDataset } from './dataset.ts';
const commands = new WeakMap<MockDataset, Promise<unknown>>();
// Project and task commands share one atomic commit queue. Undo keeps scoped
// post-version guards; this temporary staging clone is never an Undo snapshot.
export async function transactMock<T>(data: MockDataset, run: (staged: MockDataset) => Promise<T>): Promise<T> {
  const previous = commands.get(data) ?? Promise.resolve();
  const command = previous.catch(() => {}).then(async () => { const staged = structuredClone(data); const result = await run(staged); Object.assign(data, staged); return result; });
  commands.set(data, command);
  try { return await command; } finally { if (commands.get(data) === command) commands.delete(data); }
}
