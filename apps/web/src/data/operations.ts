import { operations } from '@studio/contracts/api';
import type { OperationId, OperationInput, OperationOutput, StudioApi } from '@studio/contracts/api';
import { StudioApiError, StudioTransportError } from './errors.ts';

export interface RequestOptions { signal?: AbortSignal }
export interface StudioClient {
  api: StudioApi;
  execute<K extends OperationId>(id: K, input: OperationInput<K>, options?: RequestOptions): Promise<OperationOutput<K>>;
}

export type OperationExecutor = (id: OperationId, input: Record<string, unknown>, options: RequestOptions) => Promise<unknown>;

// The manifest binds all 83 methods. Missing handlers reject, never fake success.
export function createStudioClient(executor: OperationExecutor): StudioClient {
  async function execute<K extends OperationId>(id: K, input: OperationInput<K>, options: RequestOptions = {}): Promise<OperationOutput<K>> {
    const operation = operations[id];
    const parsed = operation.request.safeParse(input);
    if (!parsed.success) {
      throw new StudioApiError({ error: { code: 'VALIDATION_ERROR', message: 'Invalid operation input', fieldErrors: Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join('.'), [issue.message]])) } });
    }
    options.signal?.throwIfAborted();
    const result = await executor(id, parsed.data, options);
    options.signal?.throwIfAborted();
    const response = operation.response.safeParse(result);
    if (!response.success) throw new StudioTransportError('invalidResponse', `Invalid ${id} response`);
    // The schema was selected by the same K as the request; Zod's union cannot express that correlation.
    return response.data as OperationOutput<K>;
  }
  // Every manifest key is bound once; Object.fromEntries erases those literal keys.
  const api = Object.fromEntries((Object.keys(operations) as OperationId[]).map(id => [id, (input: OperationInput<typeof id>) => execute(id, input)])) as unknown as StudioApi;
  return { api, execute };
}
