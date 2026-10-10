import type { QueryClient } from '@tanstack/react-query';

export interface ResettableMock { reset(): void }
export async function resetMockState(client: ResettableMock, queryClient: QueryClient): Promise<void> {
  // Check dev/test permission before touching cache. Client.reset owns that gate.
  client.reset();
  await queryClient.cancelQueries();
  queryClient.clear();
}
