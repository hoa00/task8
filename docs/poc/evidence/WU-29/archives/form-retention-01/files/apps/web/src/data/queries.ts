import { QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import type { OperationId, OperationInput } from '@studio/contracts/api';
import type { operations } from '@studio/contracts/api';
import { StudioApiError } from './errors.ts';
import { operationQueryKey } from './query-keys.ts';
import type { StudioClient } from './operations.ts';
import { useDataRuntime } from './context.ts';

export function createStudioQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: {
    staleTime: 30000,
    retry: (failures, error) => !(error instanceof StudioApiError && (error.status < 500 || error.detail.code === 'CAPABILITY_UNAVAILABLE')) && failures < 1,
  }, mutations: { retry: false } } });
}

export type ReadOperationId = { [K in OperationId]: (typeof operations)[K]['method'] extends 'GET' ? K : never }[OperationId];
export function studioQueryOptions<K extends ReadOperationId>(client: StudioClient, id: K, input: OperationInput<K>) {
  return queryOptions({ queryKey: operationQueryKey(id, input), queryFn: ({ signal }) => client.execute(id, input, { signal }) });
}

export function useStudioQuery<K extends ReadOperationId>(id: K, input: OperationInput<K>) {
  const { client } = useDataRuntime();
  return useQuery(studioQueryOptions(client, id, input));
}
