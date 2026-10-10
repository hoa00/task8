import { z } from 'zod';
import { assertDatasetRelations, MockDatasetSchema } from './dataset.ts';
import type { MockDataset } from './dataset.ts';
import { seedProvenance } from './seed.ts';

export interface MockStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export function mockStorageKey(workspaceId: string) { return `task8.mock.v1:${seedProvenance.sourceSha}:${workspaceId}`; }
const persistedSchema = z.strictObject({ schemaVersion: z.literal(1), fixtureSha256: z.literal(seedProvenance.fixtureSha256), dataset: MockDatasetSchema });

export function loadMockDataset(storage: MockStorage | undefined, workspaceId: string): MockDataset | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(mockStorageKey(workspaceId));
    if (!raw) return null;
    const { dataset } = persistedSchema.parse(JSON.parse(raw));
    if (dataset.workspaceId !== workspaceId) return null;
    assertDatasetRelations(dataset);
    return dataset;
  } catch { return null; }
}

export function persistMockDataset(storage: MockStorage | undefined, dataset: MockDataset): boolean {
  if (!storage) return false;
  try {
    assertDatasetRelations(dataset);
    const record = persistedSchema.parse({ schemaVersion: 1, fixtureSha256: seedProvenance.fixtureSha256, dataset });
    storage.setItem(mockStorageKey(dataset.workspaceId), JSON.stringify(record));
    return true;
  } catch { return false; }
}

export function browserMockStorage(): MockStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
