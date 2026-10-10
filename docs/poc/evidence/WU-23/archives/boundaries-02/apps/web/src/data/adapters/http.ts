import { ApiErrorSchema, operations } from '@studio/contracts/api';
import { StudioApiError, StudioTransportError, unavailable } from '../errors.ts';
import { createStudioClient } from '../operations.ts';
import type { StudioClient } from '../operations.ts';

export interface HttpApiOptions { baseUrl?: string; fetch?: typeof globalThis.fetch }

export function createHttpClient({ baseUrl = '/api/v1', fetch: fetcher = globalThis.fetch }: HttpApiOptions = {}): StudioClient {
  if (!/^\/api(?:\/[A-Za-z0-9_-]+)*$/.test(baseUrl)) throw new TypeError('HTTP API requires an origin-relative /api path');
  return createStudioClient(async (id, input, { signal }) => {
    const operation = operations[id];
    // Multipart upload and byte handling are added with the file feature; no successful placeholders.
    if (operation.transport !== 'json' || operation.requestMediaType !== 'application/json') throw unavailable(id);
    let path = operation.path.replace('/api/v1', baseUrl);
    path = path.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(String(input[key])));
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries((input.query ?? {}) as Record<string, unknown>)) {
      if (value !== undefined) query.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    if (query.size) path += `?${query}`;
    let response: Response;
    try {
      response = await fetcher(path, {
        method: operation.method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(input.body ? { 'Content-Type': 'application/json' } : {}) },
        ...(input.body ? { body: JSON.stringify(input.body) } : {}), ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new StudioTransportError('network', 'Could not reach the HTTP API');
    }
    let body: unknown;
    try { body = await response.json(); } catch { throw new StudioTransportError('invalidResponse', 'HTTP API did not return JSON'); }
    if (!response.ok) {
      const parsed = ApiErrorSchema.safeParse(body);
      if (!parsed.success) throw new StudioTransportError('invalidResponse', 'HTTP API returned an invalid error');
      throw new StudioApiError(parsed.data, response.status);
    }
    if (!operation.successStatuses.includes(response.status)) throw new StudioTransportError('invalidResponse', 'Unexpected HTTP success status');
    if (id === 'getSession') {
      const session = operations.getSession.response.safeParse(body);
      if (!session.success || session.data.data.capabilities.dataMode !== 'http') throw new StudioTransportError('invalidResponse', 'HTTP session must advertise HTTP capabilities');
    }
    return body;
  });
}

export function createHttpApi(options: HttpApiOptions = {}) { return createHttpClient(options).api; }
