import { ApiErrorSchema, operations } from '@studio/contracts/api';
import { StudioApiError, StudioTransportError } from '../errors.ts';
import { createStudioClient } from '../operations.ts';
import type { StudioClient } from '../operations.ts';

export interface HttpApiOptions { baseUrl?: string; fetch?: typeof globalThis.fetch }

export function createHttpClient({ baseUrl = '/api/v1', fetch: fetcher = globalThis.fetch }: HttpApiOptions = {}): StudioClient {
  if (!/^\/api(?:\/[A-Za-z0-9_-]+)*$/.test(baseUrl)) throw new TypeError('HTTP API requires an origin-relative /api path');
  return createStudioClient(async (id, input, { signal }) => {
    const operation = operations[id];
    let path = operation.path.replace('/api/v1', baseUrl);
    path = path.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(String(input[key])));
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries((input.query ?? {}) as Record<string, unknown>)) {
      if (value !== undefined) query.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    if (query.size) path += `?${query}`;
    let requestBody: BodyInit | undefined;
    if (id === 'uploadProjectFile') { const upload = operations.uploadProjectFile.request.parse(input).body; const form = new FormData(); form.set('file', new Blob([upload.file.bytes.slice().buffer], { type: upload.file.mimeType }), upload.file.name); form.set('clientRequestId', upload.clientRequestId); if (upload.taskId) form.set('taskId', upload.taskId); requestBody = form; } else if (input.body) requestBody = JSON.stringify(input.body);
    let response: Response;
    try {
      response = await fetcher(path, {
        method: operation.method, credentials: 'same-origin', headers: { Accept: operation.transport === 'bytes' ? '*/*' : 'application/json', ...(input.body && id !== 'uploadProjectFile' ? { 'Content-Type': 'application/json' } : {}) },
        ...(requestBody ? { body: requestBody } : {}), ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new StudioTransportError('network', 'Could not reach the HTTP API');
    }
    if (id === 'getFileContent' && response.ok) { if (response.status !== 200) throw new StudioTransportError('invalidResponse', 'Unexpected content status'); const disposition = response.headers.get('content-disposition') ?? ''; const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]; if (!encoded) throw new StudioTransportError('invalidResponse', 'Content filename is missing'); let name: string; try { name = decodeURIComponent(encoded); } catch { throw new StudioTransportError('invalidResponse', 'Content filename is invalid'); } return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'application/octet-stream', disposition: disposition.startsWith('inline') ? 'inline' : 'attachment', name }; }
    let body: unknown;
    try { body = await response.json(); } catch { throw new StudioTransportError('invalidResponse', 'HTTP API did not return JSON'); }
    if (!response.ok) {
      const parsed = ApiErrorSchema.safeParse(body);
      if (!parsed.success) throw new StudioTransportError('invalidResponse', 'HTTP API returned an invalid error');
      throw new StudioApiError(parsed.data, response.status);
    }
    if (!(operation.successStatuses as readonly number[]).includes(response.status)) throw new StudioTransportError('invalidResponse', 'Unexpected HTTP success status');
    if (id === 'getSession') {
      const session = operations.getSession.response.safeParse(body);
      if (!session.success || session.data.data.capabilities.dataMode !== 'http') throw new StudioTransportError('invalidResponse', 'HTTP session must advertise HTTP capabilities');
    }
    return body;
  });
}

export function createHttpApi(options: HttpApiOptions = {}) { return createHttpClient(options).api; }
