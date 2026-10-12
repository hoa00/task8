import type { Context } from 'hono';
import type { z } from 'zod';
import { ZodError } from 'zod';
import type { ApiEnvironment } from '../runtime.ts';
import { ApiFailure } from '../shared/errors.ts';

type ApiContext = Context<ApiEnvironment>;
// Finite transport bound; all supported operation DTOs (including escaped strings) fit.
import { apiLimits, transportLimits } from '../shared/limits.ts';
export const maxJsonBodyBytes = transportLimits.maxJsonBodyBytes;
export const maxUploadBytes = apiLimits.maxUploadBytes;
export const multipartOverheadBytes = transportLimits.multipartOverheadBytes;
export function parseRequest<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError)
      throw new ApiFailure('VALIDATION_ERROR', 'Invalid request', { cause: error });
    throw error;
  }
}
export async function rejectBody(context: ApiContext): Promise<void> {
  if (
    Number(context.req.header('content-length') ?? 0) > 0 ||
    context.req.header('transfer-encoding')
  )
    throw new ApiFailure('VALIDATION_ERROR', 'Operation does not accept a body');
  const reader = context.req.raw.body?.getReader();
  if (!reader) return;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      if (item.value.byteLength) {
        await reader.cancel();
        throw new ApiFailure('VALIDATION_ERROR', 'Operation does not accept a body');
      }
    }
  } finally {
    reader.releaseLock();
  }
}
export async function readQuery(context: ApiContext): Promise<Record<string, unknown>> {
  if (context.req.method === 'GET') await rejectBody(context);
  const result: Record<string, unknown> = {};
  for (const [key, values] of Object.entries(context.req.queries())) {
    const value = values[0];
    if (values.length !== 1 || value === undefined)
      throw new ApiFailure('VALIDATION_ERROR', 'Repeated query field');
    if (key === 'limit') {
      if (!/^\d+$/.test(value)) throw new ApiFailure('VALIDATION_ERROR', 'Invalid limit');
      result[key] = Number(value);
    } else if (['archived', 'favoriteOnly', 'unreadOnly'].includes(key)) {
      if (value !== 'true' && value !== 'false')
        throw new ApiFailure('VALIDATION_ERROR', 'Invalid boolean');
      result[key] = value === 'true';
    } else if (key === 'filters') {
      try {
        result[key] = JSON.parse(value);
      } catch {
        throw new ApiFailure('VALIDATION_ERROR', 'Invalid filters');
      }
    } else result[key] = key === 'assigneeId' && value === 'null' ? null : value;
  }
  return result;
}
export async function noInput(context: ApiContext) {
  await rejectBody(context);
  if (Object.keys(await readQuery(context)).length)
    throw new ApiFailure('VALIDATION_ERROR', 'Query fields not accepted');
}
export async function readRequestBytes(request: Request, cap: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length') ?? 0) > cap)
    throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Request body exceeds byte limit');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > cap) {
        await reader.cancel();
        throw new ApiFailure('PAYLOAD_TOO_LARGE', 'Request body exceeds byte limit');
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function jsonBody(context: ApiContext): Promise<unknown> {
  if (
    Object.keys(context.req.query()).length ||
    context.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    throw new ApiFailure('VALIDATION_ERROR', 'JSON body required without query fields');
  const bytes = await readRequestBytes(context.req.raw, maxJsonBodyBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiFailure('VALIDATION_ERROR', 'Invalid JSON');
  }
}
export async function multipartBody(context: ApiContext): Promise<FormData> {
  const contentType = context.req.header('content-type');
  if (Object.keys(context.req.query()).length || !contentType?.startsWith('multipart/form-data'))
    throw new ApiFailure('VALIDATION_ERROR', 'Multipart file required');
  const bytes = await readRequestBytes(context.req.raw, maxUploadBytes + multipartOverheadBytes);
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { 'content-type': contentType } }).formData();
  } catch {
    throw new ApiFailure('VALIDATION_ERROR', 'Invalid multipart');
  }
  for (const key of form.keys())
    if (!['file', 'clientRequestId', 'taskId'].includes(key) || form.getAll(key).length !== 1)
      throw new ApiFailure('VALIDATION_ERROR', 'Unexpected multipart field');
  return form;
}
