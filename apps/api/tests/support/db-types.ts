// Compile-only public-boundary checks; this is not a Worker entry or runtime fixture.
import type { RequestRepository } from '../../src/db/client.ts';
export function databaseBoundaryTypes(repository: RequestRepository) {
  // @ts-expect-error Raw bindings are private to execution adapter.
  void repository.binding;
  // @ts-expect-error Raw Drizzle client is private to execution adapter.
  void repository.db;
  // @ts-expect-error Callers cannot reserve statements manually.
  repository.reserve(1);
  return repository.read((database) => {
    // @ts-expect-error Read builder does not expose an underlying binding.
    void database.$client;
    // @ts-expect-error D1 commands use native guarded batches, not transaction callbacks.
    void database.transaction;
    return Promise.resolve([]);
  });
}
